import { defineEndpoint } from "@directus/extensions-sdk";
import { cacheProvider, createOrUpdateFieldsInCollection, disableSchemaChange } from "utils";
import { z } from "zod";
import { Provider } from "../types";
import getProvider from "./providers";
import useMicrosoft from "./providers/azure/useMicrosoft";
import { policyFieldsSchema, settingsFieldSchema } from "./schema";
import { getEmailViewerPermissions } from "./utils";

import { InvalidProvider } from "./utils/errors";

const requestOptionsSchema = z.object({
	email: z.string(),
	query: z.string().optional(),
	users: z.array(z.string()).optional(),
	limit: z.number().refine((val) => val === 0 || val === -1 || (val >= 1 && val <= 5000), {
		message: "Limit must be 0, -1, or between 1 and 5000"
	}).default(10).optional()
});

export default defineEndpoint(async (router, context) => {
	const { env } = context;

	const provider = env.EMAIL_VIEWER_PROVIDER as Provider;

	if (!provider || !Object.values(Provider).includes(provider)) {
		throw new InvalidProvider();
	}

	if (!disableSchemaChange("EMAIL_VIEWER_DISABLE_SCHEMA_CHANGE", env)) {
		await createOrUpdateFieldsInCollection("directus_policies", policyFieldsSchema, context);
		await createOrUpdateFieldsInCollection("directus_settings", settingsFieldSchema, context);
	}

	const routeTTL: number = Number.parseInt(env.CLIENT_CACHE_TTL || "600");

	router.get("/email-viewer/debug", async (req, res) => {
		try {
			const client = useMicrosoft(env);
			const data = await client.api("/users").filter("userType eq 'member'").select("id,userPrincipalName,email,assignedPlans,displayName,givenName,surname").top(500).get() as { value: any[] };
			return res.json(data);
		}
		catch (error) {
			return res.status(500).json(error);
		}
	});

	router.all("/email-viewer/*", async (req, _, next) => {
		// Throws permissions error if user does not have access to email viewer
		const permissions = await getEmailViewerPermissions((req as any).accountability, context);
		req.emailViewerPermissions = permissions;
		next();
	});

	router.post("/email-viewer/emails", async (req, res) => {
		try {
			const parsedBody = requestOptionsSchema.parse(req.body);
			if (parsedBody.limit && parsedBody.limit < 1) parsedBody.limit = 5000;

			const cacheKey = `emails_user:${req.accountability.user}_query:${JSON.stringify(parsedBody)}`;
			const getEmails = cacheProvider(getProvider(provider).fetchEmails, routeTTL, cacheKey);
			const data = await getEmails(parsedBody, env, req.emailViewerPermissions);

			return res.json(data);
		}
		catch (error) {
			if (error instanceof z.ZodError) {
				return res.status(400).json({ errors: error.errors });
			}
			else {
				console.error(error);
				return res.status(500).send(error);
			}
		}
	});

	router.get("/email-viewer/users", async (req, res) => {
		try {
			const cacheKey = `users_user:${req.accountability.user}`;
			const getUsers = cacheProvider(getProvider(provider).fetchUsers, routeTTL, cacheKey);
			const data = await getUsers(env, req.emailViewerPermissions);
			return res.json(data);
		}
		catch (error) {
			return res.status(500).json(error);
		}
	});

	router.get("/email-viewer/domains", async (_, res) => {
		try {
			const getDomains = cacheProvider(getProvider(provider).fetchOrgDomains, routeTTL, "domains");
			const data = await getDomains(env);
			return res.json(data);
		}
		catch (error) {
			return res.status(500).json(error);
		}
	});
});
