import type { HookExtensionContext } from '@directus/types'
import type { z } from 'zod'
import type { PersistedSnapshot } from './snapshot.schema'

import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

import { load as fromYaml } from 'js-yaml'

import {
	collectionSchema,
	fieldSchema,
	metadataSchema,
	relationSchema,
	systemFieldSchema,
} from './snapshot.schema'

const BASE_FILE = 'metadata.yml'
const FIELDS_DIR = 'fields'
const RELATIONS_DIR = 'relations'
const SYSTEM_FIELDS_DIR = 'systemFields'

/**
 * Reassembles split snapshot files, rejecting incomplete or malformed recognized files.
 * @param filePaths - Snapshot metadata, collection, field, relation, and system-field paths.
 * @param logger - Directus logger.
 * @returns The snapshot to pass to the host SchemaService.
 */
export async function fromPathsToSnapshot(
	filePaths: string[],
	logger: HookExtensionContext['logger'],
): Promise<PersistedSnapshot> {
	logger.info('🔸 Starting to process snapshot files...')
	let snapshotFolder = ''
	const firstPath = filePaths[0]
	if (firstPath) {
		const pathParts = path.resolve(firstPath).split(path.sep)
		for (let count = pathParts.length; count > 0; count--) {
			const testPath = pathParts.slice(0, count).join(path.sep)
			if (existsSync(path.join(testPath, BASE_FILE))) {
				snapshotFolder = testPath
				break
			}
		}
	}

	logger.info(`🔸 Identified snapshot folder: ${snapshotFolder || 'Not found'}`)
	if (!snapshotFolder) throw new Error('Base metadata file not found')

	let base: z.infer<typeof metadataSchema> | undefined
	const collections: PersistedSnapshot['collections'] = []
	const relations: PersistedSnapshot['relations'] = []
	const fields: PersistedSnapshot['fields'] = []
	const systemFields: PersistedSnapshot['systemFields'] = []

	logger.info(`🔸 Processing ${filePaths.length} files...`)
	await Promise.all(
		filePaths.map(async (filePath) => {
			const relPath = path.relative(snapshotFolder, filePath)
			const segments = relPath.split(path.sep)
			logger.trace(`🔸 Processing file: ${relPath}`)

			const isMetadata = segments.length === 1 && segments[0] === BASE_FILE
			const isCollection = segments.length === 2 && segments[1] === `${segments[0]}.yml`
			const isField = segments.length === 3 && segments[1] === FIELDS_DIR
			const isRelation = segments.length === 3 && segments[1] === RELATIONS_DIR
			const isSystemField = segments.length === 3 && segments[1] === SYSTEM_FIELDS_DIR
			if (!isMetadata && !isCollection && !isField && !isRelation && !isSystemField) {
				logger.warn(`🔸 Unrecognized file structure: ${relPath}`)
				return
			}

			try {
				const content: unknown = fromYaml(await readFile(filePath, 'utf8'))
				if (isMetadata) {
					base = metadataSchema.parse(content)
					logger.trace('🔸 Detected base metadata file')
				} else if (isCollection) {
					collections.push(collectionSchema.parse(content))
					logger.trace(`🔸 Detected collection: ${segments[0]}`)
				} else if (isField) {
					fields.push(fieldSchema.parse(content))
					logger.trace(`🔸 Detected field: ${segments[2]} for collection ${segments[0]}`)
				} else if (isRelation) {
					relations.push(relationSchema.parse(content))
					logger.trace(
						`🔸 Detected relation: ${segments[2]} for collection ${segments[0]}`,
					)
				} else if (isSystemField) {
					systemFields.push(systemFieldSchema.parse(content))
					logger.trace(
						`🔸 Detected system field: ${segments[2]} for collection ${segments[0]}`,
					)
				}
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error)
				logger.error(`❌ Error processing file ${filePath}: ${message}`)
				throw new Error(`Invalid snapshot file ${filePath}: ${message}`, { cause: error })
			}
		}),
	)

	if (!base) throw new Error('Base metadata file not found')
	logger.info('🔸 Finished processing snapshots files into one big snapshot object')
	return { ...base, collections, relations, fields, systemFields }
}
