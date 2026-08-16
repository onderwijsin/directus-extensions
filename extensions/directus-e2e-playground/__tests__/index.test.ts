import { describe, expect, it, vi } from 'vitest'

type Action = (event: string, handler: (meta: unknown) => void) => void

const action = vi.hoisted(() => vi.fn<Action>())

type HookRegister = (context: { action: typeof action }) => void

vi.mock('@directus/extensions-sdk', () => ({
	defineHook: (register: HookRegister): undefined => {
		register({ action })
		return undefined
	},
}))

import '../src/index'

describe('Directus E2E playground hook', () => {
	it('registers handlers for item creation, updates, and deletion', () => {
		expect(action).toHaveBeenCalledTimes(3)
		expect(action.mock.calls.map(([event]) => event)).toEqual([
			'items.create',
			'items.update',
			'items.delete',
		])
	})

	it('logs the collection when an item lifecycle event fires', () => {
		const handler = action.mock.calls[0]?.[1]
		const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)

		if (!handler) throw new Error('Expected the create handler to be registered')

		handler({ collection: 'articles' })

		expect(log).toHaveBeenCalledWith(
			'directus-e2e-playground: item-event {"event":"created","collection":"articles","key":"unknown"}',
		)
	})

	it.each<[string, number, string]>([
		['updated', 1, '42'],
		['deleted', 2, 'first,second'],
	])('logs the %s event key from Directus metadata', (event, call, key) => {
		const handler = action.mock.calls[call]?.[1]
		const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)

		if (!handler) throw new Error(`Expected the ${event} handler to be registered`)

		if (event === 'updated') handler({ collection: 'articles', keys: [42] })
		else handler({ collection: 'articles', keys: ['first', 'second'] })

		expect(log).toHaveBeenCalledWith(
			`directus-e2e-playground: item-event {"event":"${event}","collection":"articles","key":"${key}"}`,
		)
	})

	it('uses numeric keys and safely handles malformed metadata', () => {
		const createHandler = action.mock.calls[0]?.[1]
		const updateHandler = action.mock.calls[1]?.[1]
		const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)

		if (!createHandler || !updateHandler) throw new Error('Expected registered handlers')

		createHandler({ collection: 'articles', key: 7 })
		createHandler(null)
		updateHandler({ collection: 42, keys: 'not-an-array' })

		expect(log).toHaveBeenNthCalledWith(
			1,
			'directus-e2e-playground: item-event {"event":"created","collection":"articles","key":"7"}',
		)
		expect(log).toHaveBeenNthCalledWith(
			2,
			'directus-e2e-playground: item-event {"event":"created","collection":"unknown","key":"unknown"}',
		)
		expect(log).toHaveBeenNthCalledWith(
			3,
			'directus-e2e-playground: item-event {"event":"updated","collection":"unknown","key":"unknown"}',
		)
	})
})
