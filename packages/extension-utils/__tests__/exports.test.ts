import { describe, expect, it } from 'vitest'

import * as app from '../src/app/index'
import * as server from '../src/server/index'
import * as shared from '../src/shared/index'

describe('runtime-aware exports', () => {
	it('exposes the same framework-neutral utilities from every supported subpath', () => {
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
			].sort(),
		)
		expect(app.isRecord).toBe(shared.isRecord)
		expect(server.isString).toBe(shared.isString)
		expect(shared.hasKey).toBeDefined()
		expect(app.attempt).toBe(shared.attempt)
		expect(server.fromEntries).toBe(shared.fromEntries)
		expect(app.createMemoryLockProvider).toBe(shared.createMemoryLockProvider)
		expect(server.createRedisLockProvider).toBeDefined()
		expect(server.createFsLockProvider).toBeDefined()
		expect(server.createFsAutoTaskMarkerStore).toBeDefined()
	})
})
