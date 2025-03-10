import type { Provider } from "../../types";
import { fetchEmails as fetchEmailsAzure, fetchOrgDomains as fetchOrgDomainsAzure, fetchUsers as fetchUsersAzure } from "./azure/methods";

const providers = {
	azure: {
		fetchUsers: fetchUsersAzure,
		fetchEmails: fetchEmailsAzure,
		fetchOrgDomains: fetchOrgDomainsAzure
	}
} as const;

const getProvider = (provider: Provider) => {
	return {
		// Cache is applied at route level
		fetchEmails: providers[provider].fetchEmails,
		fetchUsers: providers[provider].fetchUsers,
		fetchOrgDomains: providers[provider].fetchOrgDomains
	};
};

export default getProvider;
