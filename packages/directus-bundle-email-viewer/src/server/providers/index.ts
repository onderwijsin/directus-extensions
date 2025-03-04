import { fetchEmails as fetchEmailsAzure, fetchUsers as fetchUsersAzure, fetchOrgDomains as fetchOrgDomainsAzure } from './azure/methods';
import type { Provider } from '../../types';
import { cacheProvider } from 'utils'
import { cacheConfig } from '../utils/cache';
const providers = {
    azure: {
        fetchUsers: fetchUsersAzure,
        fetchEmails: fetchEmailsAzure,
        fetchOrgDomains: fetchOrgDomainsAzure
    }
} as const

const getProvider = (provider: Provider) => {
    return {
        // Emails is only cached on route level
        fetchEmails: providers[provider].fetchEmails,
        fetchUsers: cacheProvider(providers[provider].fetchUsers, cacheConfig.users, 'users'),
        fetchOrgDomains: cacheProvider(providers[provider].fetchOrgDomains, cacheConfig.domains, 'domains')
    }
} 

export default getProvider;