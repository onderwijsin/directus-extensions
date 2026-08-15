import { describe, expect, it } from 'vitest'

import * as app from '../src/app/index.js'
import * as server from '../src/server/index.js'
import * as shared from '../src/shared/index.js'

describe('runtime-aware exports', () => {
	it('exposes the same framework-neutral guards from every supported subpath', () => {
		expect(Object.keys(app).sort()).toEqual(Object.keys(shared).sort())
		expect(Object.keys(server).sort()).toEqual(Object.keys(shared).sort())
		expect(app.isRecord).toBe(shared.isRecord)
		expect(server.isString).toBe(shared.isString)
		expect(shared.hasKey).toBeDefined()
	})
})
