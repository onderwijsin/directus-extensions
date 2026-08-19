import type { LoggerLike } from '../logger'
import type { DirectusSchemaDefinition, EnsureDirectusSchemaResult } from './ensure'

interface SchemaWithCollections {
	collections: { collection?: string | null }[]
}

import { isNonBlankString, isString } from '../../shared'

/** Minimal action registration contract used by server extensions. */
export type ActionRegistrar = (event: 'server.start', handler: () => void) => void

/** Options controlling startup schema-change registration. */
export interface RegisterSchemaChangeOnStartOptions {
	name: string
	disabled: boolean
	disabledGlobally: boolean
}

/**
 * Replace the placeholder collection name throughout a portable schema definition.
 * @param name - Collection name to use in the returned definition.
 * @param schema - Portable schema definition containing one placeholder collection.
 * @returns A schema definition with collection references replaced.
 */
export function replaceCollectionNameInSchema(
	name: string,
	schema: SchemaWithCollections,
): DirectusSchemaDefinition {
	const sourceName = schema.collections[0]?.collection
	if (!isString(sourceName) || !isNonBlankString(sourceName)) {
		throw new Error('Schema definition must contain a collection name')
	}

	const sourceReference = JSON.stringify(sourceName)
	const targetReference = JSON.stringify(name)
	return JSON.parse(
		JSON.stringify(schema).replaceAll(sourceReference, targetReference),
	) as DirectusSchemaDefinition
}

/**
 * Registers an asynchronous schema ensure operation on Directus server startup.
 * @param action - Directus action registrar.
 * @param logger - Logger used for disabled and failure messages.
 * @param callback - Schema ensure operation to invoke after startup.
 * @param options - Extension and global enablement state.
 * @returns Nothing.
 */
export function registerSchemaChangeOnStart(
	action: ActionRegistrar,
	logger: LoggerLike,
	callback: () => Promise<EnsureDirectusSchemaResult>,
	options: RegisterSchemaChangeOnStartOptions,
): void {
	const { name, disabled, disabledGlobally } = options
	action('server.start', () => {
		if (disabledGlobally) {
			logger.info(name + ' schema changes are disabled globally')
			return
		}
		if (disabled) {
			logger.info(name + ' schema changes are disabled for this extension')
			return
		}

		void callback().catch((error: unknown) => {
			logger.error({ msg: name + ' schema setup failed', cause: error })
		})
	})
}
