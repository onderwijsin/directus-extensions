import { defineEndpoint } from '@directus/extensions-sdk';
import { getAccessTokenFromCode } from './auth';
import { fetchEmails } from './emailService';
import { z } from 'zod';
import NodeCache from 'node-cache';

const requestOptionsSchema = z.object({
    email: z.string(),
    users: z.array(z.string()).optional(),
    type: z.enum(['sent', 'received']).optional(),
    limit: z.number().optional(),
    offset: z.number().optional(),
});

export default defineEndpoint((router, context) => {

	const { env } = context;
	const clientId: string = env.AZURE_CLIENT_ID;
	const clientSecret: string = env.AZURE_CLIENT_SECRET;
	const tenantId: string = env.AZURE_TENANT_ID;
	const redirectUri: string = env.AZURE_CLIENT_REDIRECT_URI;
	const stdTTL: number = parseInt(env.AZURE_CLIENT_CACHE_TTL || '600');

	const cache = new NodeCache({ stdTTL });


	router.all('/*', (req, res, next) => {
		// TODO should implement permissions
		if (!(req as any).accountability?.user) {
			res.status(401).send('Unauthorized');
		}
		next()
	})

	router.get('/ms-exchange/auth/callback', async (req, res) => {
		const code = req.query.code as string;
		try {
			const token = await getAccessTokenFromCode(clientId, clientSecret, tenantId, redirectUri, code);
			res.json({ token });
		} catch (error) {
			res.status(500).send((error as any).message);
		}
	});
	router.post('/ms-exchange/emails', async (req, res) => {
		try {
			const parsedBody = requestOptionsSchema.parse(req.body);
			const cacheKey = JSON.stringify(parsedBody);
			const cachedData = cache.get(cacheKey);
            if (cachedData) {
                return res.json(cachedData);
            }
			const data = await fetchEmails(clientId, clientSecret, tenantId, redirectUri, parsedBody);
			if (data.value) {
				cache.set(cacheKey, data.value);
				res.json(data.value);
			} 
			res.json(data.error);
		} catch (error) {
			if (error instanceof z.ZodError) {
                res.status(400).json({ errors: error.errors });
            } else {
                res.status(500).send((error as any).message);
            }
		}
	});
});
