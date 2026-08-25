import { describe, expect, it, vi } from 'vitest'

import {
	registerLoopsProfileSyncHook,
	shouldSyncUserUpdate,
	toLoopsContactUpdate,
	type DirectusLoopsUser,
} from '../src/loops-webhook-hook/profile-sync'
import { envSchema } from '../src/shared/env.schema'

const env = envSchema.parse({})

const user: DirectusLoopsUser = {
	id: 'user-1',
	email: 'ada@example.com',
	first_name: 'Ada',
	last_name: 'Lovelace',
	loops_sync_enabled: true,
}

describe('Loops profile synchronization', () => {
	const updateCases: [string, Record<string, unknown>, boolean, boolean][] = [
		['user create is not represented as an update', {}, true, false],
		['disabled user profile changes', { first_name: 'Grace' }, false, false],
		['enabled name changes', { last_name: 'Byron' }, true, true],
		['enabled email changes', { email: 'ada-new@example.com' }, true, true],
		['explicit opt-in update', { loops_sync_enabled: true }, true, true],
		['explicit opt-out update', { loops_sync_enabled: false }, false, false],
		['unrelated update', { status: 'active' }, true, false],
	]

	it.each(updateCases)('%s', (_label, payload, enabled, expected) => {
		const currentUser = { ...user, loops_sync_enabled: enabled }
		expect(shouldSyncUserUpdate(payload, currentUser, env.LOOPS_SYNC_ENABLED_FIELD)).toBe(
			expected,
		)
	})

	it('maps profile fields and stable identity to a Loops update', () => {
		expect(toLoopsContactUpdate(user)).toEqual({
			userId: 'user-1',
			email: 'ada@example.com',
			properties: { firstName: 'Ada', lastName: 'Lovelace' },
		})
		expect(
			shouldSyncUserUpdate(
				{ custom_opt_in: true },
				{ ...user, custom_opt_in: true },
				'custom_opt_in',
			),
		).toBe(true)
	})

	it('registers only eligible updates and keeps Loops failures best effort', async () => {
		const handlers = new Map<string, (meta: Record<string, unknown>) => Promise<void>>()
		const action = vi.fn(
			(event: string, handler: (meta: Record<string, unknown>) => Promise<void>) => {
				handlers.set(event, handler)
			},
		)
		const updateContact = vi.fn().mockRejectedValue(new Error('Loops unavailable'))
		const logger = { error: vi.fn() }
		const usersService = { readMany: vi.fn().mockResolvedValue([user]) }
		const context = {
			database: vi.fn(),
			getSchema: vi.fn().mockResolvedValue({}),
			logger,
			services: {
				UsersService: class {
					public readMany = usersService.readMany
				},
			},
		}

		// @ts-expect-error -- the test invokes the captured action without Directus' unused context.
		registerLoopsProfileSyncHook(action, { updateContact }, context, env)
		expect(action).toHaveBeenCalledOnce()
		expect(action).toHaveBeenCalledWith('users.update', expect.any(Function))
		const handler = handlers.get('users.update')
		if (!handler) throw new Error('Expected users.update handler')

		await handler({
			collection: 'directus_users',
			keys: ['user-1'],
			payload: { loops_sync_enabled: true },
		})
		await handler({
			collection: 'directus_users',
			keys: ['user-1'],
			payload: { loops_sync_enabled: false },
		})
		await handler({
			collection: 'articles',
			keys: ['article-1'],
			payload: { first_name: 'Nope' },
		})

		expect(updateContact).toHaveBeenCalledOnce()
		expect(updateContact).toHaveBeenCalledWith(toLoopsContactUpdate(user))
		expect(logger.error).toHaveBeenCalledOnce()
	})

	it('synchronizes bulk updates one user at a time', async () => {
		const users = [user, { ...user, id: 'user-2', email: 'grace@example.com' }]
		const handlers = new Map<string, (meta: Record<string, unknown>) => Promise<void>>()
		const action = vi.fn(
			(event: string, handler: (meta: Record<string, unknown>) => Promise<void>) => {
				handlers.set(event, handler)
			},
		)
		const updateContact = vi.fn().mockResolvedValue({ success: true, id: 'contact-1' })
		const usersService = { readMany: vi.fn().mockResolvedValue(users) }
		const context = {
			database: vi.fn(),
			getSchema: vi.fn().mockResolvedValue({}),
			logger: { error: vi.fn() },
			services: {
				UsersService: class {
					public readMany = usersService.readMany
				},
			},
		}

		// @ts-expect-error -- the test invokes the captured action without Directus' unused context.
		registerLoopsProfileSyncHook(action, { updateContact }, context, env)
		const handler = handlers.get('users.update')
		if (!handler) throw new Error('Expected users.update handler')
		await handler({
			collection: 'directus_users',
			keys: ['user-1', 'user-2'],
			payload: { first_name: 'Updated' },
		})

		expect(updateContact).toHaveBeenCalledTimes(2)
		expect(updateContact.mock.invocationCallOrder[0]).toBeLessThan(
			updateContact.mock.invocationCallOrder[1] ?? Number.POSITIVE_INFINITY,
		)
	})
})
