import type { ApiExtensionContext } from "@directus/extensions";
import type { Accountability, Item } from "@directus/types";
import type { EmailViewerPermission, Policy } from "../../types";
import { ForbiddenError } from "@directus/errors";
import { cacheProvider } from "utils";

export const getGlobalEmailViewerSettings = async (context: ApiExtensionContext): Promise<Partial<Item>> => {
	const { SettingsService } = context.services;
	const settingsService = new SettingsService({
		schema: await context.getSchema(),
		knex: context.database
	});

	const settings = await settingsService.readSingleton({
		fields: [
			"email_viewer_excluded_emails",
			"email_viewer_show_email_body",
			"email_viewer_global_excluded_tags"
		]
	});

	return settings;
};

export const getEmailViewerPermissions = async (accountability: Accountability, context: ApiExtensionContext) => {
	if (!accountability.user) throw new ForbiddenError();

	const getPermissions = cacheProvider(async (accountability: Accountability & { user: string }, context: ApiExtensionContext) => {
		const { services } = context;
		const { UsersService } = services;

		const usersService = new UsersService({
			schema: await context.getSchema(),
			knex: context.database
		});

		// Fetch both direct user and role policies
		const data = await usersService.readOne(accountability.user, {
			fields: [
				"email",
				"email_viewer_excluded_tags",
				"policies.policy.id",
				"policies.policy.email_viewer_custom_addresses",
				"policies.policy.email_viewer_permission",
				"role.policies.policy.id",
				"role.policies.policy.email_viewer_custom_addresses",
				"role.policies.policy.email_viewer_permission"
			]
		});

		const globalSettings = await getGlobalEmailViewerSettings(context);

		const policies = [
			...new Map(
				[...data.policies.map((p: { policy: Policy }) => p.policy), ...data.role.policies.map((p: { policy: Policy }) => p.policy)].map((policy) => [policy.id, policy])
			).values()
		];

		const excludedTags: string[] = [];

		if (data.email_viewer_excluded_tags) {
			excludedTags.push(...data.email_viewer_excluded_tags);
		}

		if (globalSettings.email_viewer_global_excluded_tags) {
			excludedTags.push(...globalSettings.email_viewer_global_excluded_tags);
		}

		const permissions: EmailViewerPermission = {
			userId: accountability.user,
			userEmail: data.email,
			canViewOwnEmail: policies.some((policy) => policy.email_viewer_permission === "self"),
			canViewDomainEmail: policies.some((policy) => policy.email_viewer_permission === "domain"),
			canViewAllEmail: policies.some((policy) => policy.email_viewer_permission === "all"),
			canViewAddresses: Array.from(new Set(policies.reduce((acc, policy) => {
				if (policy.email_viewer_permission === "specific" && policy.email_viewer_custom_addresses.length > 0) {
					acc.push(...policy.email_viewer_custom_addresses);
				}

				return acc;
			}, []))),
			excludedEmails: globalSettings.email_viewer_excluded_emails || [],
			excludedTags: excludedTags.map((tag) => tag.toLowerCase()),
			showEmailBody: globalSettings.email_viewer_show_email_body || false
		};
		return permissions;
	}, 60, accountability.user);

	const data = await getPermissions(accountability, context);

	return data;
};
