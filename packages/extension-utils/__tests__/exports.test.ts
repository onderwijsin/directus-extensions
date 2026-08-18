import { describe, expect, it } from 'vitest'

import * as app from '../src/app/index'
import * as server from '../src/server/index'
import * as sentry from '../src/server/sentry'
import * as shared from '../src/shared/index'

describe('runtime-aware exports', () => {
	it('keeps Directus coordination utilities on the server subpath', () => {
		expect(Object.keys(app).sort()).toEqual(Object.keys(shared).sort())
		expect(Object.keys(server).sort()).toEqual(
			[
				...Object.keys(shared),
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
				'DIRECTUS_EXTENSION_SCHEMA_LOCK',
				'ensureDirectusSchema',
				'getSchemaChangeStatus',
				'createSchemaChangeLockProvider',
				'schemaChangeSchema',
				'schemaLockProviderSchema',
				'getSchemaLockName',
				'registerSchemaChangeOnStart',
				'extensionSetup',
				'validateExtensionOptions',
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
