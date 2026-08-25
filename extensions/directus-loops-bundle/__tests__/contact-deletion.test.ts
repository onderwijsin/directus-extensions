import { describe, expect, it, vi } from 'vitest'

import { disableDeletedContactSync } from '../src/loops-webhook-operation/contact-deletion'

const event = (userId: string | null) => ({ contactIdentity: { userId } })

describe('disableDeletedContactSync', () => {
	it('disables synchronization for an existing Directus user', async () => {
		const readOne = vi.fn().mockResolvedValue({ id: 'user-1' })
		const updateOne = vi.fn().mockResolvedValue('user-1')

		await expect(
			disableDeletedContactSync(
				{ readOne, updateOne },
				'loops_sync_enabled',
				event('user-1'),
			),
		).resolves.toEqual({ directusUserId: 'user-1', updated: true })
		expect(updateOne).toHaveBeenCalledWith('user-1', { loops_sync_enabled: false })
	})

	it('is an acknowledged no-op when Loops has no Directus user identity', async () => {
		const readOne = vi.fn()
		const updateOne = vi.fn()

		await expect(
			disableDeletedContactSync({ readOne, updateOne }, 'loops_sync_enabled', event(null)),
		).resolves.toEqual({ directusUserId: null, updated: false })
		expect(readOne).not.toHaveBeenCalled()
		expect(updateOne).not.toHaveBeenCalled()
	})

	it('acknowledges deletion when the Directus user is already gone', async () => {
		const readOne = vi.fn().mockRejectedValue(new Error('missing'))
		const updateOne = vi.fn()

		await expect(
			disableDeletedContactSync(
				{ readOne, updateOne },
				'loops_sync_enabled',
				event('missing'),
			),
		).resolves.toEqual({ directusUserId: 'missing', updated: false })
		expect(updateOne).not.toHaveBeenCalled()
	})

	it('propagates database failures so the Flow can retry', async () => {
		const failure = new Error('database unavailable')
		const readOne = vi.fn().mockResolvedValue({ id: 'user-1' })
		const updateOne = vi.fn().mockRejectedValue(failure)

		await expect(
			disableDeletedContactSync(
				{ readOne, updateOne },
				'loops_sync_enabled',
				event('user-1'),
			),
		).rejects.toBe(failure)
	})
})
