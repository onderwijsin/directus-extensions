import type { ApiExtensionContext, SchemaOverview } from '@directus/types'
import type { LoggerLike } from '../src/server/logger'

import { describe, expect, it, vi } from 'vitest'

import {
	ensureDirectusSchema,
	type DirectusSchemaDefinition,
} from '../src/server/schema-management/ensure'
import { registerSchemaChangeOnStart } from '../src/server/schema-management/start'

type Services = ApiExtensionContext['services']
type ActionRegistrar = (event: 'server.start', handler: () => void) => void

const createLogger = () => {
	const logger: LoggerLike = {
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
	}
	return logger
}

const createFixture = (schema: SchemaOverview) => {
	const collections = new Map<string, Record<string, unknown>>()
	const fields = new Map<string, Record<string, unknown>>()
	const relations: Record<string, unknown>[] = []
	const collectionCreate = vi.fn((definition: Record<string, unknown>) => {
		collections.set(String(definition.collection), definition)
		return definition
	})
	const fieldCreate = vi.fn((collection: string, definition: Record<string, unknown>) => {
		fields.set(`${collection}.${String(definition.field)}`, definition)
		return definition
	})
	const relationCreate = vi.fn((definition: Record<string, unknown>) => {
		relations.push(definition)
		return definition
	})

	class CollectionsService {
		public readOne = vi.fn((name: string) => {
			const value = collections.get(name)
			if (!value) throw new Error('missing')
			return value
		})
		public createOne = collectionCreate
	}
	class FieldsService {
		public createField = fieldCreate
	}
	class RelationsService {
		public createOne = relationCreate
	}

	const services = {
		CollectionsService,
		FieldsService,
		RelationsService,
	} as unknown as Services
	const database = {} as ApiExtensionContext['database']
	const getSchema = vi.fn(() => Promise.resolve(schema))

	return {
		services,
		database,
		getSchema,
		collectionCreate,
		fieldCreate,
		relationCreate,
		collections,
		fields,
		relations,
	}
}

const definition: DirectusSchemaDefinition = {
	collections: [{ collection: 'magic_links' }],
	fields: [
		{
			collection: 'magic_links',
			field: 'token_hash',
			type: 'string',
		},
	],
	relations: [
		{
			collection: 'magic_links',
			field: 'user',
			related_collection: 'directus_users',
		},
	],
}

const emptySchema = (): SchemaOverview => ({
	collections: {},
	relations: [],
})

describe('ensureDirectusSchema', () => {
	it('passes the database to getSchema and all Directus services', async () => {
		const fixture = createFixture(emptySchema())
		const logger = createLogger()

		const result = await ensureDirectusSchema({
			extensionId: 'test',
			database: fixture.database,
			getSchema: fixture.getSchema,
			logger,
			definition,
			services: fixture.services,
			options: { useLockedSchemaChange: false },
		})

		expect(result).toEqual({
			changed: [
				'collection:magic_links',
				'field:magic_links.token_hash',
				'relation:magic_links.user',
			],
			skipped: false,
		})
		expect(fixture.getSchema).toHaveBeenCalledWith({
			database: fixture.database,
			bypassCache: true,
		})
		expect(fixture.collectionCreate).toHaveBeenCalledWith(definition.collections[0])
		expect(fixture.fieldCreate).toHaveBeenCalledWith('magic_links', definition.fields[0])
		expect(fixture.relationCreate).toHaveBeenCalledWith(definition.relations[0])
	})

	it('passes collection, field, and relation properties through unchanged', async () => {
		const fixture = createFixture(emptySchema())
		const richDefinition: DirectusSchemaDefinition = {
			collections: [
				{
					collection: 'rich_schema',
					meta: { icon: 'bolt', hidden: true, note: 'owned by the extension' },
					schema: {},
				},
			],
			fields: [
				{
					collection: 'rich_schema',
					field: 'secret',
					type: 'string',
					meta: {
						interface: 'input' as const,
						display: 'formatted-value' as const,
						width: 'half',
						note: 'masked by the consumer UI',
					} as never,
					schema: { is_nullable: false } as never,
				},
			],
			relations: [
				{
					collection: 'rich_schema',
					field: 'user',
					related_collection: 'directus_users',
					one_collection: 'directus_users',
					one_field: 'rich_records',
				} as never,
			],
		}

		await ensureDirectusSchema({
			extensionId: 'rich-test',
			database: fixture.database,
			getSchema: fixture.getSchema,
			logger: createLogger(),
			definition: richDefinition,
			services: fixture.services,
			options: { useLockedSchemaChange: false },
		})

		expect(fixture.collectionCreate).toHaveBeenCalledWith(richDefinition.collections[0])
		expect(fixture.fieldCreate).toHaveBeenCalledWith('rich_schema', richDefinition.fields[0])
		expect(fixture.relationCreate).toHaveBeenCalledWith(richDefinition.relations[0])
	})

	it('supports an empty definition without touching Directus services', async () => {
		const fixture = createFixture(emptySchema())

		await expect(
			ensureDirectusSchema({
				extensionId: 'empty-test',
				database: fixture.database,
				getSchema: fixture.getSchema,
				logger: createLogger(),
				definition: { collections: [], fields: [], relations: [] },
				services: fixture.services,
				options: { useLockedSchemaChange: false },
			}),
		).resolves.toEqual({ changed: [], skipped: false })
		expect(fixture.collectionCreate).not.toHaveBeenCalled()
		expect(fixture.fieldCreate).not.toHaveBeenCalled()
		expect(fixture.relationCreate).not.toHaveBeenCalled()
	})

	it('does not recreate compatible resources', async () => {
		const schema = emptySchema()
		schema.collections.magic_links = {
			fields: { token_hash: { type: 'string' } },
		} as never
		schema.relations = [
			{ collection: 'magic_links', field: 'user', related_collection: 'directus_users' },
		] as never
		const fixture = createFixture(schema)
		fixture.collections.set('magic_links', { collection: 'magic_links' })

		const result = await ensureDirectusSchema({
			extensionId: 'test',
			database: fixture.database,
			getSchema: fixture.getSchema,
			logger: createLogger(),
			definition,
			services: fixture.services,
			options: { useLockedSchemaChange: false },
		})

		expect(result).toEqual({ changed: [], skipped: false })
		expect(fixture.collectionCreate).not.toHaveBeenCalled()
		expect(fixture.fieldCreate).not.toHaveBeenCalled()
		expect(fixture.relationCreate).not.toHaveBeenCalled()
	})

	it('treats matching structure as compatible even when UI metadata differs', async () => {
		const schema = emptySchema()
		schema.collections.magic_links = {
			fields: { token_hash: { type: 'string' } },
		} as never
		schema.relations = [
			{
				collection: 'magic_links',
				field: 'user',
				related_collection: 'directus_users',
				one_field: 'different_alias',
			},
		] as never
		const fixture = createFixture(schema)
		fixture.collections.set('magic_links', {
			collection: 'magic_links',
			meta: { hidden: true, icon: 'old-icon' },
		})

		const result = await ensureDirectusSchema({
			extensionId: 'metadata-test',
			database: fixture.database,
			getSchema: fixture.getSchema,
			logger: createLogger(),
			definition,
			services: fixture.services,
			options: { useLockedSchemaChange: false },
		})

		expect(result).toEqual({ changed: [], skipped: false })
		expect(fixture.collectionCreate).not.toHaveBeenCalled()
		expect(fixture.fieldCreate).not.toHaveBeenCalled()
		expect(fixture.relationCreate).not.toHaveBeenCalled()
	})

	it('preserves incompatible fields and relations without aborting', async () => {
		const schema = emptySchema()
		schema.collections.magic_links = {
			fields: { token_hash: { type: 'integer' } },
		} as never
		schema.relations = [
			{ collection: 'magic_links', field: 'user', related_collection: 'other' },
		] as never
		const fixture = createFixture(schema)
		fixture.collections.set('magic_links', { collection: 'magic_links' })
		const logger = createLogger()

		const result = await ensureDirectusSchema({
			extensionId: 'test',
			database: fixture.database,
			getSchema: fixture.getSchema,
			logger,
			definition,
			services: fixture.services,
			options: { useLockedSchemaChange: false, abortOnError: false },
		})

		expect(result).toEqual({ changed: [], skipped: false })
		expect(fixture.fieldCreate).not.toHaveBeenCalled()
		expect(fixture.relationCreate).not.toHaveBeenCalled()
		expect(logger.error).toHaveBeenCalledTimes(2)
	})

	it('logs malformed field and relation definitions without calling services', async () => {
		const fixture = createFixture(emptySchema())
		const logger = createLogger()
		const malformedDefinition = {
			collections: [],
			fields: [{ field: 'missing_collection', type: 'string' }],
			relations: [{ collection: 'links', field: 'user' }],
		} as unknown as DirectusSchemaDefinition

		const result = await ensureDirectusSchema({
			extensionId: 'malformed-test',
			database: fixture.database,
			getSchema: fixture.getSchema,
			logger,
			definition: malformedDefinition,
			services: fixture.services,
			options: { useLockedSchemaChange: false },
		})

		expect(result).toEqual({ changed: [], skipped: false })
		expect(fixture.fieldCreate).not.toHaveBeenCalled()
		expect(fixture.relationCreate).not.toHaveBeenCalled()
		expect(logger.error).toHaveBeenCalledTimes(2)
	})

	it('rethrows collection creation failures by default with phase context', async () => {
		const fixture = createFixture(emptySchema())
		fixture.collectionCreate.mockRejectedValueOnce(new Error('collection write failed'))
		const logger = createLogger()

		await expect(
			ensureDirectusSchema({
				extensionId: 'failure-test',
				database: fixture.database,
				getSchema: fixture.getSchema,
				logger,
				definition,
				services: fixture.services,
				options: { useLockedSchemaChange: false },
			}),
		).rejects.toThrow('collection write failed')
		expect(logger.error).toHaveBeenCalledWith(
			expect.objectContaining({
				phase: 'collection',
				resource: 'magic_links',
			}),
		)
	})

	it('keeps completed changes and stops at a failed field in best-effort mode', async () => {
		const fixture = createFixture(emptySchema())
		fixture.collectionCreate.mockImplementationOnce((value) => {
			fixture.collections.set(String(value.collection), value)
			return value
		})
		fixture.fieldCreate.mockRejectedValueOnce(new Error('field write failed'))
		const logger = createLogger()

		const result = await ensureDirectusSchema({
			extensionId: 'best-effort-test',
			database: fixture.database,
			getSchema: fixture.getSchema,
			logger,
			definition,
			services: fixture.services,
			options: { useLockedSchemaChange: false, abortOnError: false },
		})

		expect(result).toEqual({ changed: ['collection:magic_links'], skipped: false })
		expect(fixture.relationCreate).not.toHaveBeenCalled()
		expect(logger.warn).toHaveBeenCalledWith(
			expect.objectContaining({ msg: expect.stringContaining('Continuing') }),
		)
	})

	it('returns skipped when another operation owns the lock', async () => {
		const fixture = createFixture(emptySchema())
		const lockProvider = {
			tryAcquire: vi.fn(() => Promise.resolve(null)),
		}

		const result = await ensureDirectusSchema({
			extensionId: 'test',
			database: fixture.database,
			getSchema: fixture.getSchema,
			logger: createLogger(),
			definition,
			services: fixture.services,
			options: { useLockedSchemaChange: true, lockProvider },
		})

		expect(result).toEqual({ changed: [], skipped: true })
		expect(fixture.getSchema).not.toHaveBeenCalled()
	})

	it('passes the lease option and releases an acquired consumer lock', async () => {
		const fixture = createFixture(emptySchema())
		const lease = {
			name: 'directus-extension-schema:lease-test',
			token: 'test-token',
			renew: vi.fn(() => Promise.resolve(true)),
			release: vi.fn(() => Promise.resolve(true)),
		}
		const lockProvider = {
			tryAcquire: vi.fn(() => Promise.resolve(lease)),
		}

		const result = await ensureDirectusSchema({
			extensionId: 'lease-test',
			database: fixture.database,
			getSchema: fixture.getSchema,
			logger: createLogger(),
			definition: { collections: [], fields: [], relations: [] },
			services: fixture.services,
			options: { useLockedSchemaChange: true, lockProvider, lockLeaseMs: 1234 },
		})

		expect(result).toEqual({ changed: [], skipped: false })
		expect(lockProvider.tryAcquire).toHaveBeenCalledWith(
			'directus-extension-schema:lease-test',
			{
				leaseMs: 1234,
			},
		)
		expect(lease.release).toHaveBeenCalledOnce()
	})

	it('creates and disposes a provider from lockProviderConfig', async () => {
		const fixture = createFixture(emptySchema())
		const logger = createLogger()

		const result = await ensureDirectusSchema({
			extensionId: 'configured-lock-test',
			database: fixture.database,
			getSchema: fixture.getSchema,
			logger,
			definition: { collections: [], fields: [], relations: [] },
			services: fixture.services,
			options: {
				useLockedSchemaChange: true,
				lockProviderConfig: {
					DIRECTUS_EXTENSIONS_SCHEMA_CHANGES_ENABLED: true,
					DIRECTUS_EXTENSIONS_USE_LOCKED_SCHEMA_CHANGE: true,
					DIRECTUS_EXTENSIONS_LOCK_PROVIDER: 'MEMORY',
				},
			},
		})

		expect(result).toEqual({ changed: [], skipped: false })
		expect(logger.info).toHaveBeenCalledWith(
			expect.objectContaining({ msg: '🔐 Acquired schema ensure lock' }),
		)
	})

	it('supports non-aborting service failures', async () => {
		const fixture = createFixture(emptySchema())
		fixture.getSchema.mockRejectedValueOnce(new Error('database unavailable'))
		const logger = createLogger()

		const result = await ensureDirectusSchema({
			extensionId: 'test',
			database: fixture.database,
			getSchema: fixture.getSchema,
			logger,
			definition,
			services: fixture.services,
			options: { useLockedSchemaChange: false, abortOnError: false },
		})

		expect(result).toEqual({ changed: [], skipped: false })
		expect(logger.warn).toHaveBeenCalledWith(
			expect.objectContaining({ msg: expect.stringContaining('Continuing') }),
		)
	})
})

describe('registerSchemaChangeOnStart', () => {
	it.each([
		['globally disabled', { disabledGlobally: true, disabled: false }],
		['extension disabled', { disabledGlobally: false, disabled: true }],
	])('does not invoke the callback when %s', async (_name, options) => {
		const action = vi.fn<ActionRegistrar>()
		const callback = vi.fn(() => Promise.resolve({ changed: [], skipped: false }))
		const logger = createLogger()
		registerSchemaChangeOnStart(action, logger, callback, {
			name: 'Test',
			...options,
		})

		expect(action).toHaveBeenCalledOnce()
		const handler = action.mock.calls[0]?.[1]
		if (!handler) throw new Error('Expected startup handler')
		handler()
		await Promise.resolve()
		expect(callback).not.toHaveBeenCalled()
		expect(logger.info).toHaveBeenCalledOnce()
	})

	it('invokes enabled callbacks and logs rejected callbacks', async () => {
		const action = vi.fn<ActionRegistrar>()
		const callback = vi.fn(() => Promise.reject(new Error('startup failure')))
		const logger = createLogger()
		registerSchemaChangeOnStart(action, logger, callback, {
			name: 'Test',
			disabled: false,
			disabledGlobally: false,
		})

		const handler = action.mock.calls[0]?.[1]
		if (!handler) throw new Error('Expected startup handler')
		handler()
		await vi.waitFor(() => expect(callback).toHaveBeenCalledOnce())
		await vi.waitFor(() => expect(logger.error).toHaveBeenCalledOnce())
		expect(logger.error).toHaveBeenCalledWith(
			expect.objectContaining({ msg: 'Test schema setup failed' }),
		)
	})
})
