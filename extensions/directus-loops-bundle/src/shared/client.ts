import type { LoopsEnv } from '../loops-webhook-hook/env.schema'

import { LoopsClient } from 'loops'

/**
 * Creates a configured official Loops JavaScript SDK client.
 * @param env - Validated Loops environment options.
 * @returns Configured Loops SDK client.
 */
export function createLoopsClient(env: LoopsEnv): LoopsClient {
	if (!env.LOOPS_API_KEY) throw new Error('Loops API key is required')

	const loops = new LoopsClient(env.LOOPS_API_KEY)
	loops.apiRoot = `${env.LOOPS_API_BASE_URL.replace(/\/+$/u, '')}/api/`
	return loops
}
