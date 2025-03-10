import { fetchEmails as fetchEmailsAzure, fetchUsers as fetchUsersAzure, fetchOrgDomains as fetchOrgDomainsAzure } from './azure/methods';
import type { Provider } from '../../types';
const providers = {
    azure: {
        fetchUsers: fetchUsersAzure,
        fetchEmails: fetchEmailsAzure,
        fetchOrgDomains: fetchOrgDomainsAzure
    }
} as const

const getProvider = (provider: Provider) => {
    return {
        // Cache is applied at route level
        fetchEmails: providers[provider].fetchEmails,
        fetchUsers: providers[provider].fetchUsers,
        fetchOrgDomains: providers[provider].fetchOrgDomains
    }
} 

export default getProvider;