import type { ApiExtensionContext, Item, SchemaOverview } from '@directus/types'
import type { LockProvider } from '../../lock'

import { createHash } from 'node:crypto'

import { z } from 'zod'

import { attempt } from '../../../shared/attempt'
import { getDirectusStartupLockName } from '../config'
import { resolveDirectusLockProvider } from './core'

const COLLECTION_NAME = 'studio_docs'
const STARTUP_ID = 'directus-studio-docs-bundle'
const INCOMING_VERSION_KEY = 'incoming'

/** Article fields owned by a participating extension's documentation seed. */
export const docsArticleSchema = z.object({
	id: z.uuid(),
	navigation_label: z.string().trim().min(1),
	body: z.string(),
	icon: z.string().trim().min(1).nullable().default(null),
	archived: z.boolean().default(false),
})

/** Input accepted by `ensureDirectusDocumentation`. */
export type DocsArticle = z.input<typeof docsArticleSchema>

type NormalizedDocsArticle = z.output<typeof docsArticleSchema>

/** Options controlling one documentation article seed. */
export interface EnsureDirectusDocumentationOptions {
	/** Lock provider held by a startup coordinator, when called from startup data. */
	lockProvider?: LockProvider
	/** Provider configuration used when this helper owns the startup lock. */
	lockProviderConfig?: Parameters<typeof resolveDirectusLockProvider>[0]['lockProviderConfig']
	/** Extension-specific opt-out. False always prevents the seed. */
	extensionSeedEnabled?: boolean
	/** Whether changed seeds replace the main item or create/update `incoming`. */
	strategy?: 'override' | 'versioning'
	/** Whether failures should be rethrown after logging. Defaults to true. */
	abortOnError?: boolean
	/** Name included in failure logs. */
	extensionName?: string
}

/**
 * Checks whether an environment value disables a feature.
 * @param value - Environment value to inspect.
 * @returns Whether the value is a false sentinel.
 */
const isFalse = (value: unknown): boolean => value === false || value === 'false'

/**
 * Selects the fields owned by a documentation seed.
 * @param article - Normalized article.
 * @returns Stable seed-owned fields.
 */
const canonicalArticle = (article: NormalizedDocsArticle): Record<string, unknown> => ({
	archived: article.archived,
	body: article.body,
	icon: article.icon,
	navigation_label: article.navigation_label,
	id: article.id,
})

/**
 * Creates a stable content fingerprint for a documentation article.
 * @param article - Normalized article.
 * @returns SHA-256 content fingerprint.
 */
const fingerprint = (article: NormalizedDocsArticle): string =>
	createHash('sha256')
		.update(JSON.stringify(canonicalArticle(article)))
		.digest('hex')

/**
 * Validates an existing Directus documentation item.
 * @param item - Main item returned by Directus.
 * @returns Validated article fields.
 */
const articleFromItem = (item: Item): NormalizedDocsArticle => docsArticleSchema.parse(item)

/**
 * Builds service options for Directus item and version services.
 * @param context - Directus API context.
 * @param schema - Current schema.
 * @returns Service constructor options.
 */
const itemServiceOptions = (context: ApiExtensionContext, schema: SchemaOverview) => ({
	accountability: null,
	knex: context.database,
	schema,
})

/**
 * Ensures one extension-owned article in the fixed Studio Docs collection.
 *
 * @param article - Stable article definition supplied by a participating extension.
 * @param context - Directus API extension context.
 * @param options - Optional gates, locking, and reconciliation behavior.
 * @returns A promise that resolves after reconciliation or a configured no-op.
 */
export async function ensureDirectusDocumentation(
	article: DocsArticle,
	context: ApiExtensionContext,
	options: EnsureDirectusDocumentationOptions = {},
): Promise<void> {
	const seed = docsArticleSchema.parse(article)
	if (isFalse(context.env.DIRECTUS_DOCS_ENABLED)) return
	if (isFalse(context.env.DIRECTUS_DOCS_SEED_ENABLED)) return
	if (isFalse(context.env.DIRECTUS_EXTENSIONS_DATA_SEED_ENABLED)) return
	if (options.extensionSeedEnabled === false) return

	const configuredProvider = resolveDirectusLockProvider({
		lockProvider: options.lockProvider,
		lockProviderConfig: options.lockProviderConfig,
	})
	const provider = configuredProvider.provider
	const lease = options.lockProvider
		? null
		: await provider.tryAcquire(getDirectusStartupLockName(STARTUP_ID))

	if (!options.lockProvider && !lease) {
		await configuredProvider.dispose()
		context.logger.info({
			msg: '⏭️ Studio Docs article seed skipped; another operation holds the lock',
		})
		return
	}

	try {
		const schema = await context.getSchema()
		const collectionsService = new context.services.CollectionsService({
			accountability: null,
			knex: context.database,
			schema,
		})
		const collection = await attempt(() => collectionsService.readOne(COLLECTION_NAME))
		if (collection.error) {
			context.logger.info({
				msg: 'Studio Docs article seed skipped; collection is unavailable',
				collection: COLLECTION_NAME,
			})
			return
		}

		const itemsService = new context.services.ItemsService(COLLECTION_NAME, {
			...itemServiceOptions(context, schema),
		})
		const existingResult = await attempt(() => itemsService.readOne(seed.id))
		if (existingResult.error || existingResult.data === null) {
			await itemsService.createOne(seed)
			return
		}

		const existing = articleFromItem(existingResult.data)
		if (fingerprint(existing) === fingerprint(seed)) return
		if ((options.strategy ?? 'versioning') === 'override') {
			await itemsService.updateOne(seed.id, seed)
			return
		}

		const versionsService = new context.services.VersionsService({
			...itemServiceOptions(context, schema),
		})
		const versions = await versionsService.readByQuery({
			filter: {
				collection: { _eq: COLLECTION_NAME },
				item: { _eq: seed.id },
				key: { _eq: INCOMING_VERSION_KEY },
			},
			limit: 1,
		})
		const incoming = versions[0]
		const incomingId = incoming?.id
		if (typeof incomingId === 'string' || typeof incomingId === 'number') {
			await versionsService.save(incomingId, seed)
		} else {
			const versionId = await versionsService.createOne({
				collection: COLLECTION_NAME,
				item: seed.id,
				key: INCOMING_VERSION_KEY,
				name: 'Incoming',
			})
			await versionsService.save(versionId, seed)
		}
	} catch (error) {
		context.logger.error({
			msg: 'Studio Docs article seed failed',
			article: seed.id,
			extension: options.extensionName ?? 'unknown',
			cause: error,
		})
		if (options.abortOnError ?? true) throw error
	} finally {
		if (lease) await lease.release()
		if (!options.lockProvider) await configuredProvider.dispose()
	}
}
