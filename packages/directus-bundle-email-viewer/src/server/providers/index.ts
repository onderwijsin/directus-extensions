import { fetchEmails as fetchEmailsAzure, fetchUsers as fetchUsersAzure, fetchOrgDomains as fetchOrgDomainsAzure } from './azure/methods';
import type { Provider, User, EmailViewerPermission } from '../../types';
import NodeCache from 'node-cache';
import type { EndpointExtensionContext } from "@directus/extensions";

const providers = {
    azure: {
        fetchUsers: fetchUsersAzure,
        fetchEmails: fetchEmailsAzure,
        fetchOrgDomains: fetchOrgDomainsAzure
    }
} as const

const getProvider = (provider: Provider) => {
    // Manually wrap methods in cache
    const userCache = new NodeCache({ stdTTL: 60 * 60 * 4 });
    const domainCache = new NodeCache({ stdTTL: 60 * 60 * 24 });

    return {
        // Emails is only cached on route level
        fetchEmails: providers[provider].fetchEmails,
        fetchUsers: async (env: EndpointExtensionContext["env"], permissions: EmailViewerPermission) => {
            const cacheKey = 'users_user:' + permissions.userId
            const cachedData = userCache.get(cacheKey);
            if (cachedData) {
                return cachedData as User[]
            }

            const data = await providers[provider].fetchUsers(env, permissions);
            if (data) {
                userCache.set(cacheKey, data)
            }
            return data
        },
        fetchOrgDomains: async (env: EndpointExtensionContext["env"]) => {
            if (domainCache.get('domains')) {
                return domainCache.get('domains') as string[]
            }
            const data = await providers[provider].fetchOrgDomains(env);
            if (data.length) {
                domainCache.set('domains', data)
            }
            return data
        }
    }
} 

export default getProvider;