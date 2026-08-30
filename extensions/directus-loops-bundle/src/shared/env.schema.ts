import { directusStartupSchema } from '@onderwijsin/directus-extension-utils/server'
import { z } from 'zod'

const collectionIdentifier = z
	.string()
	.trim()
	.min(1)
	.regex(/^[A-Za-z_][A-Za-z0-9_$]*$/u, 'must be a valid Directus collection identifier')

/** Treats blank secret environment variables as omitted optional values. */
const optionalSecret = z.preprocess(
	(value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
	z.string().trim().min(1).optional(),
)

/** Environment configuration used by the Loops startup hook. */
export const envSchema = directusStartupSchema.safeExtend({
	LOOPS_ENABLED: z.boolean().default(true),
	LOOPS_SYNC_ENABLED: z.boolean().default(true),
	LOOPS_API_KEY: optionalSecret,
	LOOPS_WEBHOOK_SIGNING_SECRET: optionalSecret,
	LOOPS_WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS: z.number().int().nonnegative().default(300),
	LOOPS_API_BASE_URL: z.url().default('https://app.loops.so'),
	LOOPS_WEBHOOK_EVENT_ALLOWLIST: z
		.array(z.string().trim().min(1))
		.min(1)
		.default(['campaign.email.sent', 'contact.deleted']),
	LOOPS_CAMPAIGN_PROCESSING_LEASE_MS: z.number().int().positive().default(300_000),
	LOOPS_LMX_PARSING_MODE: z.enum(['best_effort', 'strict']).default('best_effort'),
	LOOPS_SYNC_ENABLED_FIELD: collectionIdentifier.default('loops_sync_enabled'),
	LOOPS_CAMPAIGNS_COLLECTION: collectionIdentifier.default('loops_campaigns'),
	LOOPS_CAMPAIGN_RECIPIENTS_COLLECTION: collectionIdentifier.default('loops_campaign_recipients'),
	LOOPS_SCHEMA_CHANGES_ENABLED: z.boolean().default(true),
	LOOPS_SCHEMA_ABORT_ON_ERROR: z.boolean().default(true),
	LOOPS_DOCS_SEED_ENABLED: z.boolean().default(true),
	LOOPS_MANAGE_EMAIL_CAMPAIGNS_POLICY_ENABLED: z.boolean().default(true),
	LOOPS_VIEW_EMAIL_CAMPAIGNS_POLICY_ENABLED: z.boolean().default(true),
})

/** Validated environment options used by the Loops startup hook. */
export type LoopsEnv = z.output<typeof envSchema>
