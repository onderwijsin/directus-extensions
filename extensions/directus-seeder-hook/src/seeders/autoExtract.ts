import type { ActionHandler } from '@onderwijsin/directus-extension-utils/types'
import type { DataScope } from '../lib/config'
import type { ServiceAdapterContext } from '../services/ServiceAdapter'

import { createAutoTaskHandler } from '../lib/autoTaskHandler'
import { getFolderPaths } from '../lib/filesystem'
import { toSeedRecord } from '../lib/seedItem'
import { extractData, getFilteredCollections } from './extract'
import { getCollections, resolveSeederConfig } from './resolveConfig'

/**
 * Registers scope-specific CRUD events with one debounce and bulk-operation lock.
 * @param action - Directus action registration function.
 * @param context - Validated Directus hook runtime.
 * @returns Cleanup for pending automatic extraction; running work may finish.
 */
export function registerAutoExtractHook(
	action: (event: string, handler: ActionHandler) => void,
	context: ServiceAdapterContext,
): () => void {
	const { logger, env } = context
	const autoInclude = env.SEEDER_AUTO_EXTRACT_INCLUDE
	const base = resolveSeederConfig(env)
	const scopes: DataScope[] = ['system', 'core']
	const configurations = scopes
		.filter((scope) =>
			scope === 'system' ? env.SEEDER_AUTO_EXTRACT_SYSTEM : env.SEEDER_AUTO_EXTRACT_CORE,
		)
		.map((dataScope) => ({
			...base,
			dataScope,
			jsonOnly:
				dataScope === 'core' ||
				env.SEEDER_JSON_ONLY ||
				(autoInclude !== undefined && !autoInclude.includes('directus_files')),
			...(autoInclude === undefined
				? {}
				: { includeCollections: autoInclude, excludeCollections: [], skipClean: true }),
		}))
	const pending = new Set<DataScope>()
	const schedule = createAutoTaskHandler({
		debounceId: 'seed-extract',
		logger,
		debounceTime: 15_000,
		maxLockAge: 5 * 60 * 1000,
		/**
		 * Discards dirty scopes when a bulk import suppresses automatic work.
		 * @returns Nothing.
		 */
		onSkip: () => pending.clear(),
		/**
		 * Drains the changed scopes in a fixed order under the shared lock.
		 * @returns Resolves after every changed scope has been attempted.
		 */
		task: async () => {
			const changed = new Set(pending)
			pending.clear()
			for (const config of configurations.filter(({ dataScope }) => changed.has(dataScope))) {
				const { seedsFolder, assetsFolder } = getFolderPaths(env, config.dataScope)
				try {
					await extractData({
						...config,
						folders: { seeds: seedsFolder, assets: assetsFolder },
						context,
					})
					logger.info(`✅ ${config.dataScope} seed data successfully extracted!`)
				} catch (error) {
					logger.error(
						`[directus-seeder-hook] ❌ Error during ${config.dataScope} auto-extract: ${error instanceof Error ? error.message : 'Unknown error'}`,
					)
				}
			}
		},
	})

	for (const config of configurations) {
		const collections = getFilteredCollections(
			config.includeCollections,
			config.excludeCollections,
			getCollections(config).map(({ collection }) => collection),
		)
		const events = ['create', 'update', 'delete'].flatMap((crud) =>
			collections.map((collection) =>
				// Directus 12 emits both items.<crud> and <collection>.items.<crud> for core.
				// Subscribe only to the latter, never to both forms of the same event.
				config.dataScope === 'system'
					? `${collection.slice('directus_'.length)}.${crud}`
					: `${collection}.items.${crud}`,
			),
		)
		for (const event of events) {
			action(event, (input) => {
				if (
					event === 'users.update' &&
					Object.keys(toSeedRecord(input.payload ?? {})).every(
						(key) => key === 'last_page',
					)
				)
					return
				pending.add(config.dataScope)
				schedule()
			})
		}
		logger.info(
			`[directus-seeder-hook] ✅ Auto-extract ${config.dataScope} hook registered for events: ${events.join(', ')}`,
		)
	}

	return schedule.dispose
}
