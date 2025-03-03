
import { defineEndpoint } from '@directus/extensions-sdk';
import { Provider } from '../types';
import providers from './providers';
import { z } from 'zod';
import NodeCache from 'node-cache';
import { InvalidProvider } from './utils/errors';

import { createFieldsInCollection, getEmailViewerPermissions } from './utils';
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

	await createFieldsInCollection('directus_policies', policyFieldsSchema, context);
	
	const stdTTL: number = parseInt(env.CLIENT_CACHE_TTL || '600');
	const cache = new NodeCache({ stdTTL });
	


	router.all('/*', async (req, res, next) => {
		const permissions = await getEmailViewerPermissions((req as any).accountability, context);

		//@ts-expect-error
		req.emailViewerPermissions = permissions
		next()
	})


	router.post('/email-viewer/emails', async (req, res) => {
		try {
			let parsedBody = requestOptionsSchema.parse(req.body);

			if (parsedBody.limit && parsedBody.limit < 1) parsedBody.limit = 5000;
			const cacheKey = JSON.stringify(parsedBody);
			const cachedData = cache.get(cacheKey);
            if (cachedData) {
                return res.json(cachedData);
            }
			// @ts-expect-error
			const permissions = req.emailViewerPermissions;
			const data = await providers[provider].fetchEmails(parsedBody, env, permissions);
			if (data) {
				cache.set(cacheKey, data);
			} 
			res.json(data);
		} catch (error) {
			if (error instanceof z.ZodError) {
                res.status(400).json({ errors: error.errors });
            } else {
				console.log(error)
                res.status(500).send(error);
            }
		}
	});



	router.get('/email-viewer/users', async (req, res) => {
		try {
			const cacheKey = 'users_user:' + (req as any).accountability.user
			const cachedData = cache.get(cacheKey);
			if (cachedData) {
                return res.json(cachedData);
            }
			// @ts-expect-error
			const permissions = req.emailViewerPermissions;
			const data = await providers[provider].fetchUsers(env, permissions);
			if (data) {
				cache.set(cacheKey, data);
			} 
			return res.json(data)
		} catch (error) {
			return res.status(500).json(error)
		}
	});

	router.get('/email-viewer/domains', async (req, res) => {
		try {
			const cacheKey = 'domains'
			const cachedData = cache.get(cacheKey);
			if (cachedData) {
                return res.json(cachedData);
            }
			const data = await providers[provider].fetchOrgDomains(env);
			if (data) {
				cache.set(cacheKey, data);
			} 
			return res.json(data)
		} catch (error) {
			return res.status(500).json(error)
		}
	});
});
