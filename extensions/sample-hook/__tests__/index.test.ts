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

describe('sample hook', () => {
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
			'sample-hook: item-event {"event":"created","collection":"articles","key":"unknown"}',
		)
	})
})
