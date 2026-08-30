import type { ApiExtensionContext, Item, SchemaOverview } from '@directus/types'
import type { LockProvider } from '../lock'

import { createHash } from 'node:crypto'

import { z } from 'zod'

import { attempt } from '../../shared/attempt'
import { getDirectusStartupLockName } from './config'
import { resolveDirectusLockProvider } from './operations/core'

const COLLECTION_NAME = 'studio_docs'
const STARTUP_ID = 'directus-studio-docs-bundle'
const INCOMING_VERSION_KEY = 'incoming'

/** Article fields owned by a participating extension's documentation seed. */
export const docsArticleSchema = z.object({
	uuid: z.uuid(),
	navigation_label: z.string().trim().min(1),
	body: z.string(),
	sort: z.number().int().default(0),
	icon: z.string().trim().min(1).nullable().default(null),
	archived: z.boolean().default(false),
})

/** Input accepted by `seedDocsArticle`. */
export type DocsArticle = z.output<typeof docsArticleSchema>

/** Options controlling one documentation article seed. */
export interface SeedDocsArticleOptions {
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
 * Checks a Directus environment value for the disabled sentinel.
 * @param value - Environment value to inspect.
 * @returns Whether it disables a feature.
 */
const isFalse = (value: unknown): boolean => value === false || value === 'false'

/**
 * Selects the fields owned by a documentation seed.
 * @param article - Normalized article.
 * @returns Stable seed-owned fields.
 */
const canonicalArticle = (article: DocsArticle): Record<string, unknown> => ({
	archived: article.archived,
	body: article.body,
	icon: article.icon,
	navigation_label: article.navigation_label,
	sort: article.sort,
	uuid: article.uuid,
})

/**
 * Creates a stable content fingerprint for an article seed.
 * @param article - Normalized article.
 * @returns SHA-256 content fingerprint.
 */
const fingerprint = (article: DocsArticle): string =>
	createHash('sha256')
		.update(JSON.stringify(canonicalArticle(article)))
		.digest('hex')

/**
 * Validates an existing Directus item as a seeded article.
 * @param item - Main item returned by Directus.
 * @returns Validated article fields.
 */
const articleFromItem = (item: Item): DocsArticle => docsArticleSchema.parse(item)

/**
 * Builds shared options for Directus service constructors.
 * @param context - Directus API context.
 * @param schema - Current schema.
 * @returns Service options.
 */
const itemServiceOptions = (context: ApiExtensionContext, schema: SchemaOverview) => ({
	accountability: null,
	knex: context.database,
	schema,
})

/**
 * Seeds one extension-owned article into the fixed Studio Docs collection.
 *
 * @param article - Stable article definition supplied by a participating extension.
 * @param context - Directus API extension context.
 * @param options - Optional gates, locking, and reconciliation behavior.
 * @returns A promise that resolves after reconciliation or a configured no-op.
 */
export async function seedDocsArticle(
	article: DocsArticle,
	context: ApiExtensionContext,
	options: SeedDocsArticleOptions = {},
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
		const existingResult = await attempt(() => itemsService.readOne(seed.uuid))
		if (existingResult.error || existingResult.data === null) {
			await itemsService.createOne(seed)
			return
		}

		const existing = articleFromItem(existingResult.data)
		if (fingerprint(existing) === fingerprint(seed)) return
		if ((options.strategy ?? 'versioning') === 'override') {
			await itemsService.updateOne(seed.uuid, seed)
			return
		}

		const versionsService = new context.services.VersionsService({
			...itemServiceOptions(context, schema),
		})
		const versions = await versionsService.readByQuery({
			filter: {
				collection: { _eq: COLLECTION_NAME },
				item: { _eq: seed.uuid },
				key: { _eq: INCOMING_VERSION_KEY },
			},
			limit: 1,
		})
		const incoming = versions[0]
		if (incoming) {
			await versionsService.save(incoming.id, seed)
		} else {
			const versionId = await versionsService.createOne({
				collection: COLLECTION_NAME,
				item: seed.uuid,
				key: INCOMING_VERSION_KEY,
				name: 'Incoming',
			})
			await versionsService.save(versionId, seed)
		}
	} catch (error) {
		context.logger.error({
			msg: 'Studio Docs article seed failed',
			article: seed.uuid,
			extension: options.extensionName ?? 'unknown',
			cause: error,
		})
		if (options.abortOnError ?? true) throw error
	} finally {
		if (lease) await lease.release()
		if (!options.lockProvider) await configuredProvider.dispose()
	}
}
