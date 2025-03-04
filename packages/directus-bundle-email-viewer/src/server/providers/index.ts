import { fetchEmails as fetchEmailsAzure, fetchUsers as fetchUsersAzure, fetchOrgDomains as fetchOrgDomainsAzure } from './azure/methods';

const providers = {
    azure: {
        fetchUsers: fetchUsersAzure,
        fetchEmails: fetchEmailsAzure,
        fetchOrgDomains: fetchOrgDomainsAzure
    }
} as const

export default providers;