import { describe, expect, it } from 'vitest'

import {
	getMagicLinkRefreshContext,
	runAsMagicLinkRefresh,
} from '../src/shared/magic-link-refresh-context'

const wait = (milliseconds: number): Promise<void> =>
	new Promise((resolve) => setTimeout(resolve, milliseconds))

describe('magic-link refresh context', () => {
	it('is absent outside a marked refresh', () => {
		expect(getMagicLinkRefreshContext()).toBeUndefined()
	})

	it('survives asynchronous work inside the marked refresh', async () => {
		await runAsMagicLinkRefresh('user-a', async () => {
			await wait(1)
			expect(getMagicLinkRefreshContext()).toMatchObject({ userId: 'user-a' })
		})
	})

	it('keeps concurrent refresh contexts isolated for different users', async () => {
		const contexts = await Promise.all([
			runAsMagicLinkRefresh('user-a', async () => {
				await wait(5)
				return getMagicLinkRefreshContext()
			}),
			runAsMagicLinkRefresh('user-b', async () => {
				await wait(1)
				return getMagicLinkRefreshContext()
			}),
		])

		expect(contexts).toEqual([{ userId: 'user-a' }, { userId: 'user-b' }])
	})

	it('keeps concurrent refresh contexts isolated for the same user', async () => {
		const contexts = await Promise.all([
			runAsMagicLinkRefresh('same-user', async () => {
				await wait(5)
				return getMagicLinkRefreshContext()
			}),
			runAsMagicLinkRefresh('same-user', async () => {
				await wait(1)
				return getMagicLinkRefreshContext()
			}),
		])

		expect(contexts[0]).toEqual({ userId: 'same-user' })
		expect(contexts[1]).toEqual({ userId: 'same-user' })
		expect(contexts[0]).not.toBe(contexts[1])
	})

	it('restores the parent context after nested work', async () => {
		await runAsMagicLinkRefresh('outer-user', async () => {
			expect(getMagicLinkRefreshContext()).toMatchObject({ userId: 'outer-user' })

			await runAsMagicLinkRefresh('inner-user', async () => {
				await wait(1)
				expect(getMagicLinkRefreshContext()).toMatchObject({ userId: 'inner-user' })
			})

			expect(getMagicLinkRefreshContext()).toMatchObject({ userId: 'outer-user' })
		})

		expect(getMagicLinkRefreshContext()).toBeUndefined()
	})

	it('does not leak context after a failed refresh', async () => {
		await expect(
			runAsMagicLinkRefresh('failed-user', async () => {
				await wait(1)
				throw new Error('refresh failed')
			}),
		).rejects.toThrow('refresh failed')

		expect(getMagicLinkRefreshContext()).toBeUndefined()
	})
})
