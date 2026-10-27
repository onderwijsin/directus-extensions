import { existsSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { defineHook } from '@onderwijsin/directus-extension-utils/hook'
import {
	createAutoTaskHandler,
	createFsTaskHandlerStorage,
	extensionSetup,
	validateExtensionOptions,
} from '@onderwijsin/directus-extension-utils/server'

import { createSnapshot } from '../shared/createSnapshot'
import { envSchema } from './env.schema'

export default defineHook(({ action }, context) => {
	const { logger, env } = context
	const setup = extensionSetup('schema_snapshot', env, logger)
	setup.start()
	if (!setup.isEnabled()) return

	const options = validateExtensionOptions(env, envSchema, logger)
	logger.info('🪝 Initializing auto-snapshot hook')

	if (!options.SCHEMA_SPLIT_MANAGEMENT_AUTO_SNAPSHOT) {
		logger.info('⛔️ Auto-snapshot is disabled')
		setup.end()
		return
	}

	const storage = createFsTaskHandlerStorage({
		directory: path.join(os.tmpdir(), 'directus-schema-snapshot'),
	})
	const flagPath = path.join(os.tmpdir(), 'directus-schema-applying.flag')
	const handleSchemaChange = createAutoTaskHandler({
		taskId: 'schema-snapshot',
		storage,
		logger,
		debounceMs: 15_000,
		markerLeaseMs: 5 * 60 * 1000,
		taskLeaseMs: 5 * 60 * 1000,
		/**
		 * Writes the debounced snapshot unless a CLI apply is in progress.
		 * @param signal - Cancellation signal for a lost execution lease.
		 * @returns A promise that resolves after the snapshot is written or skipped.
		 */
		task: async (signal) => {
			if (existsSync(flagPath)) return
			logger.info('🪝 Taking automatic schema snapshot...')
			await createSnapshot(options.SCHEMA_SPLIT_MANAGEMENT_SNAPSHOT_FOLDER, context, signal)
			logger.info('🪝 Automatic schema snapshot complete')
		},
	})

	const schemaChangeEvents = [
		'collections.create',
		'collections.update',
		'collections.delete',
		'fields.create',
		'fields.update',
		'fields.delete',
		'relations.create',
		'relations.update',
		'relations.delete',
	]

	for (const event of schemaChangeEvents) {
		action(event, async () => {
			if (!existsSync(flagPath)) await handleSchemaChange()
		})
	}

	/**
	 * Releases timers and coordination resources during shutdown.
	 * @returns A promise that resolves after cleanup.
	 */
	const dispose = async () => {
		handleSchemaChange.dispose()
		await storage.dispose()
	}
	action('server.stop', dispose)

	logger.info('✅ Auto-snapshot hook initialized')
	setup.end()
})
