import { describe, expect, it, vi } from 'vitest'

import { cleanupMagicLinks, registerMagicLinkCleanup } from '../src/magic-links-hook/cleanup'

type QueryFake = ReturnType<typeof vi.fn> & {
	where: ReturnType<typeof vi.fn>
	orWhere: ReturnType<typeof vi.fn>
	delete: ReturnType<typeof vi.fn>
}

const createQuery = (): QueryFake => {
	const query = vi.fn() as QueryFake
	Object.assign(query, {
		where: vi.fn(() => query),
		orWhere: vi.fn(() => query),
		delete: vi.fn(() => 3),
	})
	return query
}

describe('magic-link cleanup', () => {
	it('deletes links older than the retention window by expiry or redemption', async () => {
		const query = createQuery()
		const transaction = vi.fn(() => query)
		const database = vi.fn()
		Object.assign(database, {
			transaction: vi.fn((callback: (value: typeof transaction) => unknown) =>
				callback(transaction),
			),
		})
		const now = new Date('2026-08-18T12:00:00.000Z')

		await expect(
			cleanupMagicLinks({
				database: database as unknown as Parameters<
					typeof cleanupMagicLinks
				>[0]['database'],
				collection: 'magic_links',
				retentionWindow: '24h',
				now,
			}),
		).resolves.toBe(3)

		expect(transaction).toHaveBeenCalledWith('magic_links')
		expect(query.where).toHaveBeenCalledWith(
			'expires_at',
			'<',
			new Date('2026-08-17T12:00:00.000Z'),
		)
		expect(query.orWhere).toHaveBeenCalledWith(
			'redeemed_at',
			'<',
			new Date('2026-08-17T12:00:00.000Z'),
		)
		expect(query.delete).toHaveBeenCalledOnce()
	})

	it('propagates database failures to the scheduled caller', async () => {
		const failure = new Error('database unavailable')
		const database = vi.fn()
		Object.assign(database, {
			transaction: vi.fn(() => {
				throw failure
			}),
		})

		await expect(
			cleanupMagicLinks({
				database: database as unknown as Parameters<
					typeof cleanupMagicLinks
				>[0]['database'],
				collection: 'magic_links',
				retentionWindow: '24h',
			}),
		).rejects.toBe(failure)
	})

	it('registers only enabled schedules and contains job failures', async () => {
		const schedule = vi.fn()
		const logger = { info: vi.fn(), error: vi.fn() }
		const database = vi.fn()
		Object.assign(database, {
			transaction: vi.fn(() => {
				throw new Error('database unavailable')
			}),
		})
		const input = {
			database: database as unknown as Parameters<typeof cleanupMagicLinks>[0]['database'],
			collection: 'magic_links',
			retentionWindow: '24h',
			cron: '0 * * * *',
			enabled: true,
			logger: logger as unknown as Parameters<typeof registerMagicLinkCleanup>[1]['logger'],
		}

		registerMagicLinkCleanup(schedule, { ...input, enabled: false })
		expect(schedule).not.toHaveBeenCalled()

		registerMagicLinkCleanup(schedule, input)
		expect(schedule).toHaveBeenCalledWith('0 * * * *', expect.any(Function))
		const callback = schedule.mock.calls[0]?.[1] as unknown as (() => Promise<void>) | undefined
		if (!callback) throw new Error('Expected cleanup schedule callback')

		await callback()
		expect(logger.error).toHaveBeenCalledWith(
			expect.objectContaining({ msg: 'Magic-link cleanup failed' }),
		)
	})
})
