import type { EndpointExtensionContext } from "@directus/extensions";
import type { Domain, Message, User as MsUser } from "@microsoft/microsoft-graph-types";
import type { EmailViewerPermission, RequestOptions } from "../../../types";
import { cacheProvider, parseEmailDomain } from "utils";
import { cacheConfig } from "../../utils/cache";
import { ProviderError } from "../../utils/errors";
import { formatEmailData, formatUserData } from "./transforms";
import useMicrosoft from "./useMicrosoft";

const fetchEmailsForUser = async (options: Omit<RequestOptions, "users"> & { user: string }, includeBody: boolean, env: EndpointExtensionContext["env"]) => {
	try {
		const client = useMicrosoft(env);
		// NOTE using nested any selectors, such as t:t/emailAddress/address breaks stuff
		// For now we'll use a search operation to filter the emails
		// This sucks though, becasue right now we can't uswe filters. And i would really like a date time filter

		const fields = [
			"id",
			"createdDateTime",
			"categories",
			"sentDateTime",
			"hasAttachments",
			"internetMessageId",
			"subject",
			"bodyPreview",
			"categories",
			"isRead",
			"webLink",
			"sender",
			"from",
			"toRecipients",
			"ccRecipients",
			"bccRecipients"
		];

		if (includeBody) {
			fields.push("body");
		}

		const data = await client.api(`/users/${options.user}/messages`)
			.search(`"${options.query || ""}<${options.email}>"`)
			.top(options.limit || 100)
		// .skip(options.offset || 0)
			.select(fields)
			.get() as { value: Array<Message> };

		return formatEmailData(data.value);
	}
	catch (error) {
		throw new ProviderError({
			provider_error: error
		});
	}
};

export const fetchUsers = async (env: EndpointExtensionContext["env"], permissions: EmailViewerPermission) => {
	try {
		const client = useMicrosoft(env);
		const data = await client.api("/users").filter("userType eq 'member'").select("id,userPrincipalName,email,assignedPlans,displayName,givenName,surname").top(500).get() as { value: MsUser[] };

		const activeUsers = formatUserData(
			data.value
				.filter((user) => user.userPrincipalName && !!user.assignedPlans?.length)
		);

		const filteredUsers = activeUsers.filter((user) => {
			// Filter global excluded user emails
			if (permissions.excludedEmails.includes(user.email) && user.email !== permissions.userEmail) {
				return false;
			}

			if (permissions.canViewAllEmail) {
				return true;
			}

			if (permissions.canViewDomainEmail && parseEmailDomain(user.email) === parseEmailDomain(permissions.userEmail)) {
				return true;
			}

			if (permissions.canViewOwnEmail && user.email === permissions.userEmail) {
				return true;
			}

			return permissions.canViewAddresses.includes(user.email);
		});

		return filteredUsers;
	}
	catch (error) {
		throw new ProviderError({
			provider_error: error
		});
	}
};

export const fetchOrgDomains = async (env: EndpointExtensionContext["env"]) => {
	try {
		const client = useMicrosoft(env);
		const data = await client.api("/domains").top(500).get() as { value: Domain[] };
		const domainList = data.value.filter((domain) => domain.supportedServices?.includes("Email")).map((domain) => domain.id).filter(Boolean) as string[];

		return domainList;
	}
	catch (error) {
		throw new ProviderError({
			provider_error: error
		});
	}
};

export const fetchEmails = async (options: RequestOptions, env: EndpointExtensionContext["env"], permissions: EmailViewerPermission) => {
	try {
		let { users, ...rest } = options;

		// The array availableUsers is a list of all users accounts that the current user has access to
		// Cant directly reference the function in this file, because we want it wrapped in cache!
		const cacheKey = `users_user:${JSON.stringify(permissions)}`;
		const getUsers = cacheProvider(fetchUsers, cacheConfig.users, cacheKey);
		const availableUsers = await getUsers(env, permissions);

		if (!users?.length) {
			users = availableUsers.map((user) => user.id).filter(Boolean) as string[];
		}
		else {
			// create an array of both emails and ids, since both can be used to fetch emails
			const permittedUsers = new Set([
				...availableUsers.map((user) => user.email).filter(Boolean) as string[],
				...availableUsers.map((user) => user.id).filter(Boolean) as string[]
			]);
			users = users.filter((user) => permittedUsers.has(user));
		}

		const orgDomains = await fetchOrgDomains(env);

		const data = await Promise.all(users.map((user) => fetchEmailsForUser({ ...rest, user }, permissions.showEmailBody, env)));
		return data
			.flat()
			.sort(
				(a, b) => new Date(b.sentDateTime).getTime() - new Date(a.sentDateTime).getTime()
			)
			.filter((email) => {
				// Filter out internal email
				if (
					orgDomains.includes(parseEmailDomain(email.from.emailAddress.address))
					&& email.toRecipients.every((recipient) => orgDomains.includes(parseEmailDomain(recipient.emailAddress.address)))
				) {
					return false;
				}

				return true;
			})
			.filter((email) => {
				// Filter excluded tags
				const tags = new Set(email.categories.map((tag) => tag.toLowerCase()));

				if (permissions.excludedTags.some((tag) => tags.has(tag))) {
					return false;
				}

				return true;
			});
	}
	catch (error) {
		throw new ProviderError({
			provider_error: error
		});
	}
};
