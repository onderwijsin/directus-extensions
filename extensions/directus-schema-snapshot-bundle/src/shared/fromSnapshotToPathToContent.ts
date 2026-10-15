import type { HookExtensionContext } from '@directus/types'
import type { Snapshot } from '@directus/types'
import type { PersistedSnapshot } from './snapshot.schema'
import type { PathToContent } from './types'

import path from 'node:path'

import hash from 'object-hash'

/**
 * Appends a hashed suffix to the provided name.
 * The path uses a lowercase name and the first eight characters of the original name hash.
 *
 * @param {string} name - The original name to which the hash will be added.
 * @returns {string} The modified name with the lowercase transformation and hashed suffix.
 */
function addHashToName(name: string) {
	if (name.includes('/') || name.includes('\\') || name === '.' || name === '..') {
		throw new Error(`Invalid snapshot collection or field name: ${name}`)
	}
	return `${name.toLowerCase()}_${hash(name).slice(0, 8)}`
}

/**
 * Converts a given snapshot into a structured mapping of file paths to their content.
 * The resulting object represents the snapshot's data in a format suited for generating files.
 *
 * @param snapshot - The snapshot object containing metadata, collections, fields, and
 * relations to process.
 * @param {HookExtensionContext['logger']} logger - A logger instance used to track the process and
 * provide debugging information.
 * @returns {PathToContent} An object mapping file paths to their corresponding content, representing
 * the processed snapshot.
 */
export function fromSnapshotToPathToContent(
	snapshot: Snapshot | PersistedSnapshot,
	logger: HookExtensionContext['logger'],
): PathToContent {
	const pathToContent: PathToContent = {}

	logger.info('🔸 Starting to generate snapshot...')

	// Adds the metadata
	pathToContent['metadata.yml'] = {
		version: snapshot.version,
		directus: snapshot.directus,
		vendor: snapshot.vendor,
	}

	logger.info('🔸 Added metadata to metadata.yml')

	// Let's create all collections
	logger.info(`🔸 Processing ${snapshot.collections.length} collections...`)

	for (const collection of snapshot.collections) {
		const collectionName = addHashToName(collection.collection)
		const key = path.join(collectionName, `${collectionName}.yml`)
		pathToContent[key] = collection
		logger.trace(`🔸 Added collection at: ${key}`)
	}

	// Let's create all fields
	logger.info(`🔸 Processing ${snapshot.fields.length} fields...`)

	for (const field of snapshot.fields) {
		const key = path.join(
			addHashToName(field.collection),
			'fields',
			`${addHashToName(field.field)}.yml`,
		)
		pathToContent[key] = field
		logger.trace(`🔸 Added field at: ${key}`)
	}

	// And now the relations
	logger.info(`🔸 Processing ${snapshot.relations.length} relations...`)

	for (const relation of snapshot.relations) {
		const key = path.join(
			addHashToName(relation.collection),
			'relations',
			`${addHashToName(relation.field)}.yml`,
		)
		pathToContent[key] = relation
		logger.trace(`🔸 Added relation at: ${key}`)
	}

	logger.info('🔸 Finished deconstructing snapshot')
	return pathToContent
}
