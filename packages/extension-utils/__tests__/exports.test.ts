import { describe, expect, it } from 'vitest'

import * as app from '../src/app/index'
import * as server from '../src/server/index'
import * as shared from '../src/shared/index'

describe('runtime-aware exports', () => {
	it('keeps Directus coordination utilities on the server subpath', () => {
		expect(Object.keys(app).sort()).toEqual(Object.keys(shared).sort())
		expect(Object.keys(server).sort()).toEqual(
			[
				...Object.keys(shared),
				'createDirectusAutoTaskMarkerStore',
				'createRedisLockProvider',
				'createFsAutoTaskMarkerStore',
				'createFsLockProvider',
				'createFsTaskHandlerStorage',
				'createRedisTaskHandlerStorage',
				'createAutoTaskHandler',
				'createMemoryAutoTaskMarkerStore',
				'createMemoryLockProvider',
				'createMemoryTaskHandlerStorage',
				'createLogger',
				'BULK_OPERATION_LOCK',
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
		expect(server.createFsAutoTaskMarkerStore).toBeDefined()
		expect(server.createAutoTaskHandler).toBeDefined()
		expect(server.createLogger).toBeDefined()
	})
})
