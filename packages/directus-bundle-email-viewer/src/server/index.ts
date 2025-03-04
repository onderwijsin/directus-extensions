import { defineEndpoint } from '@directus/extensions-sdk';
import { Provider } from '../types';
import getProvider from './providers';
import { z } from 'zod';
import { InvalidProvider } from './utils/errors';
import { createOrUpdateFieldsInCollection, cacheProvider } from 'utils'
import { getEmailViewerPermissions } from './utils';
import { policyFieldsSchema } from './schema';

const requestOptionsSchema = z.object({
    email: z.string(),
	query: z.string().optional(),
    users: z.array(z.string()).optional(),
    type: z.enum(['sent', 'received']).optional(),
	limit: z.number().refine(val => val === 0 || val === -1 || (val >= 1 && val <= 5000), {
		message: "Limit must be 0, -1, or between 1 and 5000"
	}).default(10).optional()
});

export default defineEndpoint(async (router, context) => {
	const { env } = context;

	const provider = env.EMAIL_VIEWER_PROVIDER as Provider;

	if (!provider || Object.values(Provider).indexOf(provider) === -1) {
		throw new InvalidProvider()
	}

	await createOrUpdateFieldsInCollection('directus_policies', policyFieldsSchema, context)
	
	const routeTTL: number = parseInt(env.CLIENT_CACHE_TTL || '600');
	
	router.all('/*', async (req, _, next) => {
		// Throws permissions error if user does not have access to email viewer
		const permissions = await getEmailViewerPermissions((req as any).accountability, context);
		req.emailViewerPermissions = permissions
		next()
	})

	router.post('/email-viewer/emails', async (req, res) => {
		try {
			let parsedBody = requestOptionsSchema.parse(req.body);
			if (parsedBody.limit && parsedBody.limit < 1) parsedBody.limit = 5000;

			const cacheKey = JSON.stringify(parsedBody);
			const getEmails = cacheProvider(getProvider(provider).fetchEmails, routeTTL, cacheKey);
			const data = await getEmails(parsedBody, env, req.emailViewerPermissions);

			return res.json(data);
		} catch (error) {
			if (error instanceof z.ZodError) {
                return res.status(400).json({ errors: error.errors });
            } else {
				console.log(error)
                return res.status(500).send(error);
            }
		}
	});

	router.get('/email-viewer/users', async (req, res) => {
		try {
			const cacheKey = 'users_user:' + (req as any).accountability.user
			const getUsers = cacheProvider(getProvider(provider).fetchUsers, routeTTL, cacheKey);
			const data = await getUsers(env, req.emailViewerPermissions);
			return res.json(data)
		} catch (error) {
			return res.status(500).json(error)
		}
	});

	router.get('/email-viewer/domains', async (_, res) => {
		try {
			const getDomains = cacheProvider(getProvider(provider).fetchOrgDomains, routeTTL, 'domains');
			const data = await getDomains(env);
			return res.json(data)
		} catch (error) {
			return res.status(500).json(error)
		}
	});
});
