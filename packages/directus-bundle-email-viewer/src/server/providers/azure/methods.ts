import type { EndpointExtensionContext } from "@directus/extensions";
import useMicrosoft from './useMicrosoft';
import { RequestOptions } from "../../../types";
import { ProviderError } from "../../errors";
import { formatEmailData, formatUserData } from "./transforms";
import type { Message, User } from "@microsoft/microsoft-graph-types";

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

export const fetchEmails = async (options: RequestOptions, env: EndpointExtensionContext["env"]) => {
    try {
        let { users, ...rest } = options

        if (!users?.length) {
            const data = await fetchUsers(env)
            users = data.map(user => user.email).filter(Boolean) as string[]
        }

        const data = await Promise.all(users.map(user => fetchEmailsForUser({ ...rest, user }, env)))
        return data
            .flat()
            .sort(
                (a, b) => new Date(b.sentDateTime).getTime() - new Date(a.sentDateTime).getTime()
            )
    } catch (err) {
        throw new ProviderError({
            provider_error: err,
        })
    }
}

export const fetchUsers = async (env: EndpointExtensionContext["env"]) => {
    try {
        const client = useMicrosoft(env);
        const data = await client.api('/users').filter("userType eq 'member'").select('id,userPrincipalName,email,assignedPlans,displayName,givenName,surname').top(500).get() as { value: User[] };
        
        const activeUsers = formatUserData(
            data.value
                .filter(user => user.userPrincipalName && !!user.assignedPlans?.length)
        )
        return activeUsers
    } catch (err) {
        throw new ProviderError({
            provider_error: err,
        })
    }
    
}