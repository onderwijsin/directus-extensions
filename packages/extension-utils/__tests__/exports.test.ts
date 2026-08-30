import type { ActionHandler, HookConfig, RegisterFunctions } from '../src/types'

import { describe, expect, it } from 'vitest'

import * as app from '../src/app/index'
import * as hook from '../src/hook'
import * as server from '../src/server/index'
import * as sentry from '../src/server/sentry'
import * as shared from '../src/shared/index'

const typeContract: {
	action: ActionHandler
	config: HookConfig
	register: RegisterFunctions
} | null = null

describe('runtime-aware exports', () => {
	it('exposes corrected Directus hook types on the hook subpath', () => {
		expect(hook.defineHook).toBeDefined()
		expect('defineHook' in server).toBe(false)
		expect(typeContract).toBeNull()
	})

	it('keeps Directus coordination utilities on the server subpath', () => {
		expect(Object.keys(app).sort()).toEqual(Object.keys(shared).sort())
		expect(Object.keys(server).sort()).toEqual(
			[
				...Object.keys(shared),
				'assertRequestWithAccountability',
				'asyncHandler',
				'createRedisMarkerStore',
				'createRedisLockProvider',
				'createFsMarkerStore',
				'createFsLockProvider',
				'createFsTaskHandlerStorage',
				'createRedisTaskHandlerStorage',
				'createAutoTaskHandler',
				'createMemoryMarkerStore',
				'createMemoryLockProvider',
				'createMemoryTaskHandlerStorage',
				'createLogger',
				'DIRECTUS_EXTENSION_STARTUP_LOCK',
				'ensureDirectusSchema',
				'ensureDirectusPolicy',
				'docsArticleSchema',
				'ensureDirectusDocumentation',
				'processPolicyDefinition',
				'validatePolicyDefinition',
				'validateSchemaDefinition',
				'getDirectusStartupStatus',
				'rejectWhileSchemaLocked',
				'SchemaLockedError',
				'SchemaStatusError',
				'createStartupLockProvider',
				'directusStartupSchema',
				'startupLockProviderSchema',
				'extensionRateLimiterStoreSchema',
				'resolveStartupLockProvider',
				'resolveExtensionRateLimiterStore',
				'getDirectusStartupLockName',
				'withCollectionIdentity',
				'createDirectusStartupCoordinator',
				'resolveDirectusLockProvider',
				'extensionSetup',
				'validateExtensionOptions',
				'getAccountabilityFromRequest',
				'initializeCache',
				'initializePolicyCache',
				'withCache',
				'mapCollectionInputToHookEvents',
				'registerCollectionCacheInvalidation',
				'cacheConfigSchema',
				'emailConfigSchema',
				'requiredEmailConfigSchema',
				'resolveCacheStorage',
				'resolveRedisConnectionString',
				'redisConfigSchema',
				'redisUrlSchema',
				'synchronizationConfigSchema',
				'synchronizationStoreSchema',
				'isEmailConfigured',
				'hasAuthenticatedUser',
				'isAccountability',
				'POLICY_FIELDS',
				'fetchPolicies',
				'filterPoliciesByIp',
				'hasPolicies',
				'registerPolicyCacheInvalidation',
				'policyAccessFilter',
			].sort(),
		)
		expect(app.isRecord).toBe(shared.isRecord)
		expect(server.isString).toBe(shared.isString)
		expect(shared.hasKey).toBeDefined()
		expect(app.attempt).toBe(shared.attempt)
		expect(server.fromEntries).toBe(shared.fromEntries)
		expect('createMemoryLockProvider' in app).toBe(false)
		expect('createMemoryLockProvider' in shared).toBe(false)
		expect(server.createMemoryLockProvider).toBeDefined()
		expect(server.createRedisLockProvider).toBeDefined()
		expect(server.createFsLockProvider).toBeDefined()
		expect(server.createFsMarkerStore).toBeDefined()
		expect(server.createAutoTaskHandler).toBeDefined()
		expect(server.createRedisMarkerStore).toBeDefined()
		expect(server.createMemoryMarkerStore).toBeDefined()
		expect(server.createLogger).toBeDefined()
	})

	it('keeps Sentry utilities on their explicit subpath', () => {
		expect(Object.keys(server)).not.toContain('captureException')
		expect(Object.keys(server)).not.toContain('captureMessage')
		expect(Object.keys(server)).not.toContain('addBreadcrumb')
		expect(Object.keys(server)).not.toContain('setUser')
		expect(sentry.captureException).toBeDefined()
		expect(sentry.captureMessage).toBeDefined()
		expect(sentry.addBreadcrumb).toBeDefined()
		expect(sentry.setUser).toBeDefined()
	})
})
