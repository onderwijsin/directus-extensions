import type { ActionHandler } from '@onderwijsin/directus-extension-utils/types'
import type { ServiceAdapterContext } from '../../services/ServiceAdapter'

import { createAutoTaskHandler } from '../../lib/autoTaskHandler'
import { getFolderPaths, resolveSeederConfig } from '../../lib/resolveConfig'
import { toSeedRecord } from '../../lib/seedItem'
import { extractSystemData, getFilteredCollections } from './extract'
import { getSystemCollections } from './resolveConfig'

/**
 * Registers debounced extraction for the effective automatic collection selection.
 * @param action - Directus action registration function.
 * @param context - Directus hook runtime.
 * @returns Nothing.
 */
export const registerAutoExtractSystemHook = (
	action: (event: string, handler: ActionHandler) => void,
	context: ServiceAdapterContext,
): void => {
	const { logger, env } = context

	logger.info('[directus-seeder-hook] 🌱 Registering auto-extract system hook')

	// Derive runtime values from the shared validated startup configuration
	const autoInclude = env.SEEDER_AUTO_EXTRACT_INCLUDE
	const config = resolveSeederConfig(
		env,
		autoInclude === undefined
			? {}
			: {
					includeCollections: autoInclude,
					excludeCollections: [],
					skipClean: true,
					jsonOnly: env.SEEDER_JSON_ONLY || !autoInclude.includes('directus_files'),
				},
	)
	const { seedsFolder, assetsFolder } = getFolderPaths(env)

	if (!config.autoExtract) {
		logger.info(
			'[directus-seeder-hook] ⚠️ Auto-extract is disabled in the configuration. Skipping auto-extract system hook registration.',
		)
		return
	}

	// Create a list of events to listen to
	const eventCRUDs = ['create', 'update', 'delete']

	// Check which system collections to monitor
	const collectionsToExtract = getFilteredCollections(
		config.includeCollections,
		config.excludeCollections,
		getSystemCollections(config).map(({ collection }) => collection),
	)

	// Action events of system collections don't have the "directus_" prefix, so we need to remove it
	/**
	 * Converts a system collection name to its Directus action prefix.
	 * @param str - Collection name.
	 * @returns Action prefix without directus_.
	 */
	function removePrefix(str: string) {
		const prefix = 'directus_'
		if (str.startsWith(prefix)) {
			return str.slice(prefix.length)
		}
		return str
	}

	const events = eventCRUDs.reduce<string[]>((acc, crud) => {
		for (const collection of collectionsToExtract) {
			acc.push(`${removePrefix(collection)}.${crud}`)
		}
		return acc
	}, [])

	// Handler to process schema changes with debouncing and locking
	const handleSchemaChange = createAutoTaskHandler({
		debounceId: 'seed-system-extract',
		logger,
		debounceTime: 15_000, // 15 seconds
		maxLockAge: 5 * 60 * 1000, // 5 minutes
		/**
		 * Extracts selected system collections and configured assets.
		 * @returns Resolves after extraction or error logging.
		 */
		task: async () => {
			logger.trace(
				`[directus-seeder-hook] Detected change to a system collection, triggering auto-extract if enabled...`,
			)

			try {
				// Extract and write seed data
				await extractSystemData({
					...config,
					folders: {
						seeds: seedsFolder,
						assets: assetsFolder,
					},
					context,
				})

				logger.info('✅ Seed data successfully extracted!')
			} catch (error) {
				logger.error(
					`[directus-seeder-hook] ❌ Error during auto-extract: ${error instanceof Error ? error.message : 'Unknown error'}`,
				)
			}
		},
	})

	// Input from the hook, used to prevent needless tasks
	const ignoreList: Record<string, string[]> = {
		'users.update': ['last_page'],
	}

	// Register the handler for each event
	for (const event of events) {
		action(event, (input) => {
			// Check if we should ignore this event based on the ignore list
			if (ignoreList[event]) {
				const ignoredFields = ignoreList[event]
				const inputKeys = Object.keys(toSeedRecord(input.payload ?? {}))
				const isIgnored = inputKeys.every((key) => ignoredFields.includes(key))
				if (isIgnored) {
					logger.trace(
						`[directus-seeder-hook] Ignoring event ${event} due to ignore list.`,
					)
					return
				}
			}
			handleSchemaChange()
		})
	}

	logger.info(
		`[directus-seeder-hook] ✅ Auto-extract system hook registered for events: ${events.join(', ')}`,
	)
}
