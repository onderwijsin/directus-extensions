// import type { Providers } from '../../types';
import { fetchEmails as fetchEmailsAzure, fetchUsers as fetchUsersAzure, fetchOrgDomains as fetchOrgDomainsAzure } from './azure/methods';

// TODO not sure why Providers wont work ..
const providers = {
    azure: {
        fetchUsers: fetchUsersAzure,
        fetchEmails: fetchEmailsAzure,
        fetchOrgDomains: fetchOrgDomainsAzure
    }
} as const

export default providers;