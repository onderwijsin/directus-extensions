import type { EndpointExtensionContext } from "@directus/extensions";
import useMicrosoft from './useMicrosoft';
import { RequestOptions, EmailViewerPermission } from "../../../types.d";
import { ProviderError } from "../../utils/errors";
import { formatEmailData, formatUserData } from "./transforms";
import type { User } from "../../../types";
import type { Message, User as MsUser, Domain } from "@microsoft/microsoft-graph-types";
import NodeCache from 'node-cache';
import { parseEmailDomain } from "../../utils/helpers";

export const fetchEmailsForUser = async (options: Omit<RequestOptions, 'users'> & { user: string }, env: EndpointExtensionContext["env"]) => {
    try {
        const client = useMicrosoft(env);
        // NOTE using nested any selectors, such as t:t/emailAddress/address breaks stuff
        // For now we'll use a search operation to filter the emails
        // This sucks though, becasue right now we can't uswe filters. And i would really like a date time filter

        const data = await client.api(`/users/${options.user}/messages`)
            .search(`"${options.query || ''}<${options.email}>"`)
            .top(options.limit || 100)
            // .skip(options.offset || 0)
            .select([
                'id',
                'createdDateTime',
                'categories',
                'sentDateTime',
                'hasAttachments',
                'internetMessageId',
                'subject',
                'bodyPreview',
                'isRead',
                'webLink',
                'sender',
                'from',
                'toRecipients',
                'ccRecipients',
                'bccRecipients'
            ])
            .get() as { value: Message[] };

        return formatEmailData(data.value)
    } catch (err) {
        throw new ProviderError({
            provider_error: err,
        })
    }
}

export const fetchEmails = async (options: RequestOptions, env: EndpointExtensionContext["env"], permissions: EmailViewerPermission) => {
    try {
        let { users, ...rest } = options

        // The array availableUsers is a list of all users accounts that the current user has access to
        const availableUsers = await fetchUsers(env, permissions)
        const permittedEmails = availableUsers.map(user => user.email).filter(Boolean) as string[]
        if (!users?.length) {
            users = permittedEmails
        } else {
            users = users.filter(user => permittedEmails.includes(user))
        }

        const orgDomains = await fetchOrgDomains(env)

        const data = await Promise.all(users.map(user => fetchEmailsForUser({ ...rest, user }, env)))
        return data
            .flat()
            .sort(
                (a, b) => new Date(b.sentDateTime).getTime() - new Date(a.sentDateTime).getTime()
            )
            .filter((email) => {
                // Filter out internal email
                if (
                    orgDomains.includes(parseEmailDomain(email.from.emailAddress.address))
                    && email.toRecipients.every(recipient => orgDomains.includes(parseEmailDomain(recipient.emailAddress.address)))
                ) {
                    return false
                }
                return true
            })
    } catch (err) {
        throw new ProviderError({
            provider_error: err,
        })
    }
}


const userCache = new NodeCache({ stdTTL: 60 * 60 * 4 });
export const fetchUsers = async (env: EndpointExtensionContext["env"], permissions: EmailViewerPermission) => {
    try {
        const cacheKey = 'users_user:' + permissions.userId
        const cachedData = userCache.get(cacheKey);
        if (cachedData) {
            return cachedData as User[]
        }
        const client = useMicrosoft(env);
        const data = await client.api('/users').filter("userType eq 'member'").select('id,userPrincipalName,email,assignedPlans,displayName,givenName,surname').top(500).get() as { value: MsUser[] };
        
        const activeUsers = formatUserData(
            data.value
                .filter(user => user.userPrincipalName && !!user.assignedPlans?.length)
        )

        const filteredUsers = activeUsers.filter(user => {
            if (permissions.canViewAllEmail) {
                return true
            }
            if (permissions.canViewDomainEmail && parseEmailDomain(user.email) === parseEmailDomain(permissions.userEmail)) {
                return true
            }
            if (permissions.canViewOwnEmail && user.email === permissions.userEmail) {
                return true
            }
            return permissions.canViewAddresses.includes(user.email)
        })

        if (filteredUsers) {
            userCache.set(cacheKey, filteredUsers)
        }
        return filteredUsers
    } catch (err) {
        throw new ProviderError({
            provider_error: err,
        })
    }
}

const domainCache = new NodeCache({ stdTTL: 60 * 60 * 24 });
export const fetchOrgDomains = async (env: EndpointExtensionContext["env"]) => {
    try {
        if (domainCache.get('domains')) {
            return domainCache.get('domains') as string[]
        }
        const client = useMicrosoft(env);
        const data = await client.api('/domains').top(500).get() as { value: Domain[] };

        const domainList = data.value.filter(domain => domain.supportedServices?.includes('Email')).map(domain => domain.id).filter(Boolean) as string[]
        if (domainList.length) {
            domainCache.set('domains', domainList)
        }
        return domainList
    } catch (err) {
        throw new ProviderError({
            provider_error: err,
        })
    }
    
}