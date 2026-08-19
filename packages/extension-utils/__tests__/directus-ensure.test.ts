import type { ApiExtensionContext, Policy, SchemaOverview } from '@directus/types'
import type { LoggerLike } from '../src/server/logger'

import { describe, expect, it, vi } from 'vitest'

import { directusStartupSchema } from '../src/server/directus-ensure/config'
import {
	validateSchemaDefinition,
	withCollectionIdentity,
} from '../src/server/directus-ensure/data-processors/collections'
import {
	processPolicyDefinition,
	type DirectusPolicyDefinition,
	validatePolicyDefinition,
} from '../src/server/directus-ensure/data-processors/policies'
import { getDirectusStartupStatus } from '../src/server/directus-ensure/operations/core'
import { ensureDirectusPolicy } from '../src/server/directus-ensure/operations/policies'
import {
	ensureDirectusSchema,
	type DirectusSchemaDefinition,
} from '../src/server/directus-ensure/operations/schema'
import { createStartupLockProvider } from '../src/server/directus-ensure/provider'
import { createDirectusStartupCoordinator } from '../src/server/directus-ensure/startup'

type Services = ApiExtensionContext['services']
type ActionRegistrar = (event: 'server.start', handler: () => void) => void

const createLogger = () => {
	const logger: LoggerLike = {
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
		debug: vi.fn(),
	}
	return logger
}

describe('withCollectionIdentity', () => {
	it('replaces collection references in a portable definition', () => {
		const schema: DirectusSchemaDefinition = {
			collections: [
				{
					collection: 'placeholder',
					schema: { name: 'placeholder' },
					fields: [{ collection: 'placeholder', field: 'id', type: 'uuid' }],
				},
			],
			fields: [{ collection: 'placeholder', field: 'name', type: 'string' }],
			relations: [{ collection: 'placeholder', field: 'owner' }],
		}

		const result = withCollectionIdentity('configured', schema)
		expect(result.collections[0]?.collection).toBe('configured')
		expect(result.collections[0]?.schema?.name).toBe('configured')
		expect(result.fields[0]?.collection).toBe('configured')
		expect(result.relations[0]?.collection).toBe('configured')
	})
})

describe('validateSchemaDefinition', () => {
	it('validates portable schema data and preserves loose metadata', () => {
		const definition = validateSchemaDefinition({
			collections: [
				{
					collection: 'validated_collection',
					schema: { name: 'validated_collection' },
					fields: [{ field: 'id', type: 'uuid', schema: { is_primary_key: true } }],
					custom_collection_key: 'preserved',
				},
			],
			fields: [],
			relations: [],
		})

		expect(definition.collections[0]).toMatchObject({ custom_collection_key: 'preserved' })
		expect(() => validateSchemaDefinition({ collections: [], fields: [] })).toThrow()
	})
})

describe('policy data processors', () => {
	it('validates nested permissions and processes them into linked rows', () => {
		const definition = validatePolicyDefinition({
			policies: [
				{
					id: 'policy-id',
					name: 'Policy',
					icon: 'policy',
					description: null,
					enforce_tfa: false,
					ip_access: null,
					app_access: true,
					admin_access: false,
					permissions: [{ collection: 'posts', action: 'read', fields: ['*'] }],
				},
			],
		}).policies[0]
		if (!definition) throw new Error('Expected a policy definition')

		const processed = processPolicyDefinition(definition, 'configured-policy-id')
		expect(processed.policy).not.toHaveProperty('permissions')
		expect(processed.permissions).toEqual([
			expect.objectContaining({
				policy: 'configured-policy-id',
				collection: 'posts',
				action: 'read',
				fields: ['*'],
			}),
		])
	})
})

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
	collections: [
		{
			collection: 'magic_links',
			schema: { name: 'magic_links' },
			fields: [
				{
					collection: 'magic_links',
					field: 'id',
					type: 'uuid',
					schema: { is_primary_key: true },
				},
			],
		},
	],
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
	it('shares the configured memory schema lock across provider instances', async () => {
		const options = directusStartupSchema.parse({})
		const first = createStartupLockProvider(options)
		const second = createStartupLockProvider(options)

		const lease = await first.provider.tryAcquire('directus-extension-schema:magic-links', {
			leaseMs: 50,
		})

		expect(await second.provider.isLocked('directus-extension-schema:magic-links')).toBe(true)
		expect(await lease?.release()).toBe(true)
		expect(await second.provider.isLocked('directus-extension-schema:magic-links')).toBe(false)
	})

	it('passes the database to getSchema and all Directus services', async () => {
		const fixture = createFixture(emptySchema())
		const logger = createLogger()

		const result = await ensureDirectusSchema({
			id: 'test',
			database: fixture.database,
			getSchema: fixture.getSchema,
			logger,
			definition,
			services: fixture.services,
			options: {},
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
		expect(fixture.fieldCreate).toHaveBeenCalledWith('magic_links', {
			field: definition.fields[0]?.field,
			type: definition.fields[0]?.type,
		})
		expect(fixture.relationCreate).toHaveBeenCalledWith(definition.relations[0])
		expect(logger.info).toHaveBeenCalledTimes(2)
		expect(logger.debug).toHaveBeenCalled()
	})

	it('includes collection-nested fields in the schema plan', async () => {
		const fixture = createFixture(emptySchema())
		const logger = createLogger()

		await ensureDirectusSchema({
			id: 'nested-fields-test',
			database: fixture.database,
			getSchema: fixture.getSchema,
			logger,
			definition: {
				collections: [
					{
						collection: 'nested_fields',
						fields: [
							{ collection: 'nested_fields', field: 'title', type: 'string' },
							{ collection: 'nested_fields', field: 'count', type: 'integer' },
						],
					},
				],
				fields: [{ collection: 'nested_fields', field: 'status', type: 'string' }],
				relations: [],
			},
			services: fixture.services,
			options: {},
		})

		expect(logger.info).toHaveBeenNthCalledWith(
			1,
			expect.objectContaining({
				resources: { collections: 1, fields: 3, relations: 0 },
			}),
		)
	})

	it('passes collection, field, and relation properties through unchanged', async () => {
		const fixture = createFixture(emptySchema())
		const richDefinition: DirectusSchemaDefinition = {
			collections: [
				{
					collection: 'rich_schema',
					meta: { icon: 'bolt', hidden: true, note: 'owned by the extension' },
					schema: { name: 'rich_schema' },
					fields: [
						{
							collection: 'rich_schema',
							field: 'id',
							type: 'uuid',
							schema: { is_primary_key: true },
						},
					],
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
					schema: { is_nullable: false },
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
			id: 'rich-test',
			database: fixture.database,
			getSchema: fixture.getSchema,
			logger: createLogger(),
			definition: richDefinition,
			services: fixture.services,
			options: {},
		})

		expect(fixture.collectionCreate).toHaveBeenCalledWith(richDefinition.collections[0])
		expect(fixture.fieldCreate).toHaveBeenCalledWith('rich_schema', {
			field: richDefinition.fields[0]?.field,
			type: richDefinition.fields[0]?.type,
			meta: richDefinition.fields[0]?.meta,
			schema: richDefinition.fields[0]?.schema,
		})
		expect(fixture.relationCreate).toHaveBeenCalledWith(richDefinition.relations[0])
	})

	it('supports an empty definition without touching Directus services', async () => {
		const fixture = createFixture(emptySchema())

		await expect(
			ensureDirectusSchema({
				id: 'empty-test',
				database: fixture.database,
				getSchema: fixture.getSchema,
				logger: createLogger(),
				definition: { collections: [], fields: [], relations: [] },
				services: fixture.services,
				options: {},
			}),
		).resolves.toEqual({ changed: [], skipped: false })
		expect(fixture.collectionCreate).not.toHaveBeenCalled()
		expect(fixture.fieldCreate).not.toHaveBeenCalled()
		expect(fixture.relationCreate).not.toHaveBeenCalled()
	})

	it('preserves collections without a schema name or primary key field', async () => {
		const fixture = createFixture(emptySchema())
		const logger = createLogger()
		const malformedDefinition = {
			collections: [{ collection: 'malformed' }],
			fields: [],
			relations: [],
		} as DirectusSchemaDefinition

		await expect(
			ensureDirectusSchema({
				id: 'malformed-collection-test',
				database: fixture.database,
				getSchema: fixture.getSchema,
				logger,
				definition: malformedDefinition,
				services: fixture.services,
				options: {},
			}),
		).resolves.toEqual({ changed: [], skipped: false })
		expect(fixture.collectionCreate).not.toHaveBeenCalled()
		expect(logger.error).toHaveBeenCalledWith(
			expect.objectContaining({
				resource: 'collection:malformed',
				reason: 'collection schema name and primary key field are required',
			}),
		)
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
			id: 'test',
			database: fixture.database,
			getSchema: fixture.getSchema,
			logger: createLogger(),
			definition,
			services: fixture.services,
			options: {},
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
			id: 'metadata-test',
			database: fixture.database,
			getSchema: fixture.getSchema,
			logger: createLogger(),
			definition,
			services: fixture.services,
			options: {},
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
			id: 'test',
			database: fixture.database,
			getSchema: fixture.getSchema,
			logger,
			definition,
			services: fixture.services,
			options: { abortOnError: false },
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
			id: 'malformed-test',
			database: fixture.database,
			getSchema: fixture.getSchema,
			logger,
			definition: malformedDefinition,
			services: fixture.services,
			options: {},
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
				id: 'failure-test',
				database: fixture.database,
				getSchema: fixture.getSchema,
				logger,
				definition,
				services: fixture.services,
				options: {},
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
			id: 'best-effort-test',
			database: fixture.database,
			getSchema: fixture.getSchema,
			logger,
			definition,
			services: fixture.services,
			options: { abortOnError: false },
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
			isLocked: vi.fn(() => Promise.resolve(true)),
		}

		const result = await ensureDirectusSchema({
			id: 'test',
			database: fixture.database,
			getSchema: fixture.getSchema,
			logger: createLogger(),
			definition,
			services: fixture.services,
			options: { lockProvider },
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
			isLocked: vi.fn(() => Promise.resolve(false)),
		}

		const result = await ensureDirectusSchema({
			id: 'lease-test',
			database: fixture.database,
			getSchema: fixture.getSchema,
			logger: createLogger(),
			definition: { collections: [], fields: [], relations: [] },
			services: fixture.services,
			options: { lockProvider, lockLeaseMs: 1234 },
		})

		expect(result).toEqual({ changed: [], skipped: false })
		expect(lockProvider.tryAcquire).toHaveBeenCalledWith(
			'directus-extension-startup:lease-test',
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
			id: 'configured-lock-test',
			database: fixture.database,
			getSchema: fixture.getSchema,
			logger,
			definition: { collections: [], fields: [], relations: [] },
			services: fixture.services,
			options: {
				lockProviderConfig: {
					DIRECTUS_EXTENSIONS_SCHEMA_CHANGES_ENABLED: true,
					DIRECTUS_EXTENSIONS_DATA_SEED_ENABLED: true,
					DIRECTUS_EXTENSIONS_LOCK_PROVIDER: 'memory',
					DIRECTUS_EXTENSIONS_RATE_LIMITER_STORE: 'memory',
					SYNCHRONIZATION_STORE: 'memory',
					REDIS_ENABLED: false,
				},
			},
		})

		expect(result).toEqual({ changed: [], skipped: false })
		expect(logger.debug).toHaveBeenCalledWith(
			expect.objectContaining({ msg: '🔐 Acquired schema ensure lock' }),
		)
	})

	it('supports non-aborting service failures', async () => {
		const fixture = createFixture(emptySchema())
		fixture.getSchema.mockRejectedValueOnce(new Error('database unavailable'))
		const logger = createLogger()

		const result = await ensureDirectusSchema({
			id: 'test',
			database: fixture.database,
			getSchema: fixture.getSchema,
			logger,
			definition,
			services: fixture.services,
			options: { abortOnError: false },
		})

		expect(result).toEqual({ changed: [], skipped: false })
		expect(logger.warn).toHaveBeenCalledWith(
			expect.objectContaining({ msg: expect.stringContaining('Continuing') }),
		)
	})
})

describe('ensureDirectusPolicy', () => {
	it('creates a missing policy with its durable identity', async () => {
		const fixture = createFixture(emptySchema())
		const created: Partial<Policy>[] = []
		class PoliciesService {
			public readOne = vi.fn(() => Promise.reject(new Error('missing')))
			public readByQuery = vi.fn(() => Promise.resolve([]))
			public createOne = vi.fn((policy: Partial<Policy>) => {
				created.push(policy)
				return Promise.resolve(policy.id ?? '')
			})
		}
		const createdPermissions: Partial<Policy>[] = []
		class PermissionsService {
			public readByQuery = vi.fn(() => Promise.resolve([]))
			public createOne = vi.fn((permission: Partial<Policy>) => {
				createdPermissions.push(permission)
				return Promise.resolve(1)
			})
		}
		const services = {
			...fixture.services,
			PoliciesService,
			PermissionsService,
		} as unknown as Services
		const definition: DirectusPolicyDefinition = {
			id: 'policy-id',
			name: 'Policy name',
			icon: 'policy',
			description: null,
			enforce_tfa: false,
			ip_access: null,
			app_access: false,
			admin_access: false,
			permissions: [
				{
					collection: 'posts',
					action: 'read',
					permissions: null,
					validation: null,
					presets: null,
					fields: ['*'],
				},
			],
		}

		await expect(
			ensureDirectusPolicy({
				id: 'policy-test',
				database: fixture.database,
				getSchema: fixture.getSchema,
				logger: createLogger(),
				services,
				definition,
			}),
		).resolves.toEqual({
			changed: ['policy:policy-id', 'permission:policy-id:posts:read'],
			skipped: false,
		})
		expect(created).toEqual([
			{
				id: 'policy-id',
				name: 'Policy name',
				icon: 'policy',
				description: null,
				enforce_tfa: false,
				ip_access: null,
				app_access: false,
				admin_access: false,
			},
		])
		expect(createdPermissions).toEqual([
			expect.objectContaining({ policy: 'policy-id', collection: 'posts', action: 'read' }),
		])
	})

	it('does not add permissions to an incompatible existing policy', async () => {
		const fixture = createFixture(emptySchema())
		const createPermission = vi.fn(() => Promise.resolve(1))
		class PoliciesService {
			public readOne = vi.fn(() => Promise.resolve({ id: 'policy-id', name: 'Other policy' }))
			public readByQuery = vi.fn(() => Promise.resolve([]))
			public createOne = vi.fn()
		}
		class PermissionsService {
			public readByQuery = vi.fn(() => Promise.resolve([]))
			public createOne = createPermission
		}
		const services = {
			...fixture.services,
			PoliciesService,
			PermissionsService,
		} as unknown as Services
		const definition: DirectusPolicyDefinition = {
			id: 'policy-id',
			name: 'Expected policy',
			icon: 'policy',
			description: null,
			enforce_tfa: false,
			ip_access: null,
			app_access: false,
			admin_access: false,
			permissions: [
				{
					collection: 'posts',
					action: 'read',
					permissions: null,
					validation: null,
					presets: null,
					fields: ['*'],
				},
			],
		}

		await expect(
			ensureDirectusPolicy({
				id: 'policy-conflict-test',
				database: fixture.database,
				getSchema: fixture.getSchema,
				logger: createLogger(),
				services,
				definition,
			}),
		).resolves.toEqual({ changed: [], skipped: false })
		expect(createPermission).not.toHaveBeenCalled()
	})

	it('skips without acquiring a lock when data seeds are disabled globally', async () => {
		const fixture = createFixture(emptySchema())
		const definition: DirectusPolicyDefinition = {
			id: 'disabled-policy',
			name: 'Disabled policy',
			icon: 'policy',
			description: null,
			enforce_tfa: false,
			ip_access: null,
			app_access: false,
			admin_access: false,
			permissions: [],
		}

		await expect(
			ensureDirectusPolicy({
				id: 'disabled-policy-test',
				database: fixture.database,
				getSchema: fixture.getSchema,
				logger: createLogger(),
				services: fixture.services,
				definition,
				options: {
					lockProviderConfig: {
						...directusStartupSchema.parse({}),
						DIRECTUS_EXTENSIONS_DATA_SEED_ENABLED: false,
					},
				},
			}),
		).resolves.toEqual({ changed: [], skipped: true })
	})
})

describe('getDirectusStartupStatus', () => {
	it('checks the startup lock without attempting to acquire it', async () => {
		const isLocked = vi.fn(() => Promise.resolve(true))
		const tryAcquire = vi.fn()
		const lockProvider = { isLocked, tryAcquire }

		await expect(
			getDirectusStartupStatus({
				id: 'status-test',
				options: { lockProvider },
			}),
		).resolves.toEqual({ isLocked: true })
		expect(isLocked).toHaveBeenCalledWith('directus-extension-startup:status-test')
		expect(tryAcquire).not.toHaveBeenCalled()
	})
})

describe('createDirectusStartupCoordinator', () => {
	it('runs schema callbacks before data callbacks in registration order', async () => {
		const action = vi.fn<ActionRegistrar>()
		const logger = createLogger()
		const order: string[] = []
		const startup = createDirectusStartupCoordinator(action, logger, {
			id: 'startup-test',
			name: 'Test',
			disabled: false,
			disabledGlobally: false,
		})
		startup.data(() => {
			order.push('data')
			return Promise.resolve()
		})
		startup.schema(() => {
			order.push('schema-1')
			return Promise.resolve()
		})
		startup.schema(() => {
			order.push('schema-2')
			return Promise.resolve()
		})

		action.mock.calls[0]?.[1]?.()
		await vi.waitFor(() => expect(order).toEqual(['schema-1', 'schema-2', 'data']))
	})

	it('skips data callbacks when data seeds are disabled globally', async () => {
		const action = vi.fn<ActionRegistrar>()
		const order: string[] = []
		const startup = createDirectusStartupCoordinator(action, createLogger(), {
			id: 'data-disabled-test',
			name: 'Data disabled test',
			disabled: false,
			disabledGlobally: false,
			dataDisabledGlobally: true,
		})
		startup.schema(() => {
			order.push('schema')
			return Promise.resolve()
		})
		startup.data(() => {
			order.push('data')
			return Promise.resolve()
		})

		action.mock.calls[0]?.[1]?.()
		await vi.waitFor(() => expect(order).toEqual(['schema']))
	})

	it('does not release the coordinator lease through nested callbacks', async () => {
		const action = vi.fn<ActionRegistrar>()
		const release = vi.fn(() => Promise.resolve(true))
		const lease = {
			name: 'directus-extension-startup:nested-lock-test',
			token: 'token',
			renew: vi.fn(() => Promise.resolve(true)),
			release,
		}
		const lockProvider = {
			tryAcquire: vi.fn(() => Promise.resolve(lease)),
			isLocked: vi.fn(() => Promise.resolve(true)),
		}
		const startup = createDirectusStartupCoordinator(action, createLogger(), {
			id: 'nested-lock-test',
			name: 'Nested lock test',
			disabled: false,
			disabledGlobally: false,
			lockProvider,
			autoRenew: false,
		})

		startup.schema(async ({ lockProvider: heldProvider }) => {
			const nestedLease = await heldProvider.tryAcquire(lease.name)
			expect(await nestedLease?.release()).toBe(false)
		})
		action.mock.calls[0]?.[1]?.()
		await vi.waitFor(() => expect(release).toHaveBeenCalledOnce())
	})

	it('renews the coordinator lease while callbacks run', async () => {
		const action = vi.fn<ActionRegistrar>()
		const renew = vi.fn(() => Promise.resolve(true))
		const lease = {
			name: 'directus-extension-startup:renew-test',
			token: 'token',
			renew,
			release: vi.fn(() => Promise.resolve(true)),
		}
		const lockProvider = {
			tryAcquire: vi.fn(() => Promise.resolve(lease)),
			isLocked: vi.fn(() => Promise.resolve(true)),
		}
		const startup = createDirectusStartupCoordinator(action, createLogger(), {
			id: 'renew-test',
			name: 'Renew test',
			disabled: false,
			disabledGlobally: false,
			lockProvider,
			lockLeaseMs: 9,
		})

		startup.schema(() => new Promise((resolve) => setTimeout(resolve, 20)))
		action.mock.calls[0]?.[1]?.()
		await vi.waitFor(() => expect(renew).toHaveBeenCalled())
	})
})
