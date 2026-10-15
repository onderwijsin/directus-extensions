import type { Command } from 'commander'

import { readFile, mkdir, writeFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { isRecord, isFunction } from '@onderwijsin/directus-extension-utils'
import { defineHook } from '@onderwijsin/directus-extension-utils/hook'
import {
	extensionSetup,
	validateExtensionOptions,
} from '@onderwijsin/directus-extension-utils/server'
import { load as fromYaml, dump as toYaml } from 'js-yaml'
import hash from 'object-hash'

import { createSnapshot } from '../shared/createSnapshot'
import { fromPathsToSnapshot } from '../shared/fromPathsToSnapshot'
import { fromSnapshotToPathToContent } from '../shared/fromSnapshotToPathToContent'
import { getAllFilePaths } from '../shared/getAllFilePaths'
import { getSchemaService } from '../shared/getSchemaService'
import { initializeLicenseManager } from '../shared/initializeLicenseManager'
import { snapshotSchema } from '../shared/snapshot.schema'
import { terminate } from '../shared/terminate'
import { envSchema } from './env.schema'

/**
 * Identifies the host Commander protocol without relying on a shared module instance.
 * @param value - Host CLI program to inspect.
 * @returns Whether the program can register commands.
 */
function isCliProgram(value: unknown): value is Pick<Command, 'command'> {
	return isRecord(value) && isFunction(value.command)
}

export default defineHook(({ init }, context) => {
	const { env, logger } = context

	const setup = extensionSetup('schema_snapshot', env, logger)
	setup.start()
	if (!setup.isEnabled()) return

	const options = validateExtensionOptions(env, envSchema, logger)
	const defaultSnapshotFolder = options.SCHEMA_SPLIT_MANAGEMENT_SNAPSHOT_FOLDER

	init('cli.after', ({ program }) => {
		if (!isCliProgram(program)) throw new Error('Directus CLI program is unavailable')
		const command = program.command('schema-split')

		/**
		 * Apply command
		 * Applies schema changes from a snapshot folder to the current Directus instance
		 * Usage: schema-split apply <folder>
		 */
		command
			.command('apply')
			.description('Apply a snapshot folder')
			.argument('[folder]', 'The snapshot folder to apply', defaultSnapshotFolder)
			.action(async (folder: string = defaultSnapshotFolder) => {
				let exit = 0

				const flagPath = path.join(os.tmpdir(), 'directus-schema-applying.flag')

				try {
					// Create a flag file to prevent snapshots during applying of a schema
					await writeFile(flagPath, String(Date.now()))

					logger.info('🚀 Applying schema from snapshot')
					logger.info(`📁 Snapshot folder: ${folder}`)

					const service = await getSchemaService(context)
					logger.info('🔹 Schema service initialized')

					const filePaths = await getAllFilePaths(folder)
					logger.info(`📄 Found ${filePaths.length} files`)

					const snapshot = await fromPathsToSnapshot(filePaths, logger)

					logger.info(`🔹 Parsed snapshot (version: ${snapshot.version}).`)

					// Directus v12 standalone CLI processes do not initialize licensing for extension
					// commands. Load the host's manager before license-aware schema services are used;
					// see https://github.com/directus/directus/issues/27833.
					logger.info('💎 Loading the license manager...')
					await initializeLicenseManager()
					logger.info('💎 License manager loaded and initialized!')

					let diff = null
					let retries = 0
					const maxRetries = 10

					do {
						const currentSnapshot = await service.snapshot()
						logger.info('🔹 Fetched current schema snapshot')

						diff = await service.diff(snapshot, {
							currentSnapshot,
							force: true, // Force! This will not complain about versions being different, but will apply the diff anyway.
						})

						logger.info(`🔹 Retry: ${retries}`)

						if (!diff) {
							logger.info(
								'🔹 No changes detected for main snapshot — schema already up to date',
							)
						} else {
							logger.info('🔹 Changes detected for main snapshot — applying...')

							logger.info(`🔹 Collections in diff: ${diff.collections.length}`)

							logger.info(`🔹 Fields in diff: ${diff.fields.length}`)

							logger.info(`🔹 Relations in diff: ${diff.relations.length}`)

							await service.apply({
								diff,
								hash: hash({
									// The hash must use the host version, including forced cross-version applies.
									version: currentSnapshot.directus,
									item: currentSnapshot,
								}),
							})

							logger.info('🔹 Main snapshot changes applied successfully')
						}

						retries++

						if (diff && retries >= maxRetries) {
							logger.warn(
								`❌ Maximum retries (${maxRetries}) reached: stopping diff loop`,
							)

							const currentSnapshot = await service.snapshot()
							diff = await service.diff(snapshot, { currentSnapshot, force: true })
							if (diff)
								throw new Error(
									`Schema did not converge after ${maxRetries} applications`,
								)
							break
						}
					} while (diff)
				} catch (error) {
					logger.error(
						`❌ Error applying schema:  ${error instanceof Error ? error.message : String(error)}`,
					)

					exit = 1
				} finally {
					// Always clean up the flag file
					await rm(flagPath, { force: true })
				}

				return terminate(exit)
			})

		/**
		 * Snapshot command
		 * Creates a new snapshot of the current schema state and saves it to the specified folder
		 * Usage: schema-split snapshot -o <folder>
		 */
		command
			.command('snapshot')
			.description('Dump the schema to a snapshot folder structure')
			.option('-o, --output [folder]', 'The target output folder', defaultSnapshotFolder)
			.action(async (options: { output?: string | true | undefined }) => {
				let exit = 0

				try {
					const { output: outputFolder } = options

					if (!outputFolder || typeof outputFolder === 'boolean') {
						logger.error('❌ Output folder is required')
						return terminate(1)
					}

					logger.info('🚀 Creating snapshot')
					logger.info(`📁 Snapshot folder: ${outputFolder}`)

					await createSnapshot(outputFolder, context)

					logger.info('✅ Snapshot process complete, all files written')
				} catch (error) {
					logger.error(
						`❌ Error creating snapshot:  ${error instanceof Error ? error.message : String(error)}`,
					)

					exit = 1
				}

				return terminate(exit)
			})

		/**
		 * Migrate command
		 * Converts an old snapshot file format to the new snapshot folder structure
		 * Usage: schema-split migrate -i <file> -o <folder>
		 */
		command
			.command('migrate')
			.description('Migrate an old snapshot to the new snapshots folder')
			.option('-o, --output [folder]', 'The target output folder', defaultSnapshotFolder)
			.requiredOption('-i, --input <file>', 'The snapshot that should be migrated')
			.action(
				async (options: {
					output?: string | true | undefined
					input?: string | true | undefined
				}) => {
					let exit = 0

					try {
						const { output: outputFolder, input: inputFile } = options

						if (!outputFolder || typeof outputFolder === 'boolean') {
							logger.error('❌ Output folder is required')
							return terminate(1)
						}

						if (!inputFile || typeof inputFile === 'boolean') {
							logger.error('❌ Input file is required')
							return terminate(1)
						}

						logger.info('🚀 Migrating snapshot')
						logger.info(`📁 Snapshot file: ${options.input}`)
						logger.info(`📁 Snapshot folder: ${options.output}`)

						logger.info('🔹 Processing snapshot file...')
						const inputFileRawContent = await readFile(inputFile, 'utf8')

						logger.info('🔹 Parsing YAML content...')
						const snapshotJson = snapshotSchema.parse(fromYaml(inputFileRawContent))

						logger.info('🔹 Converting snapshot to per-file YAML contents...')

						const yamlFilesByRelativePath = fromSnapshotToPathToContent(
							snapshotJson,
							logger,
						)

						for (const relativeFilePath in yamlFilesByRelativePath) {
							const yamlData = yamlFilesByRelativePath[relativeFilePath]
							const absoluteFilePath = path.join(outputFolder, relativeFilePath)
							const yamlOutput = toYaml(yamlData, {
								noRefs: true,
							})

							logger.trace(`🔹 Writing file: ${absoluteFilePath}`)
							await mkdir(path.dirname(absoluteFilePath), { recursive: true })
							await writeFile(absoluteFilePath, yamlOutput)
						}

						logger.info('🔹 Snapshot migration complete.')
					} catch (error) {
						logger.error(
							`❌ Error migrating snapshot:  ${error instanceof Error ? error.message : String(error)}`,
						)

						exit = 1
					}

					return terminate(exit)
				},
			)
	})

	setup.end()
})
