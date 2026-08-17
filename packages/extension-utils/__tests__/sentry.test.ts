import { afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
	const sentryScope = {
		setExtra: vi.fn(),
		setTags: vi.fn(),
	}

	return {
		addBreadcrumb: vi.fn(),
		captureException: vi.fn(),
		captureMessage: vi.fn(),
		scope: sentryScope,
		setUser: vi.fn(),
		withScope: vi.fn((callback: (scope: typeof sentryScope) => void) => callback(sentryScope)),
	}
})

vi.mock('@sentry/node', () => mocks)

import { addBreadcrumb, captureException, captureMessage, setUser } from '../src/server/sentry'

const tags = {
	component: 'operation' as const,
	context: 'runtime' as const,
	domain: 'catalog',
	operation: 'reindex',
}

describe('Sentry utilities', () => {
	afterEach(() => {
		vi.restoreAllMocks()
		vi.clearAllMocks()
	})

	it('captures exceptions with tags and extra context', () => {
		const error = new Error('failed')

		captureException(error, { extra: { itemCount: 3 }, tags })

		expect(mocks.withScope).toHaveBeenCalledOnce()
		expect(mocks.scope.setTags).toHaveBeenCalledWith({ ...tags, severity: 'medium' })
		expect(mocks.scope.setExtra).toHaveBeenCalledWith('itemCount', 3)
		expect(mocks.captureException).toHaveBeenCalledWith(error)
	})

	it('preserves an explicit exception severity', () => {
		const exceptionTags = { ...tags, severity: 'critical' as const }

		captureException('failed', { tags: exceptionTags })

		expect(mocks.scope.setTags).toHaveBeenCalledWith(exceptionTags)
	})

	it('captures messages with the requested level and context', () => {
		captureMessage('completed', 'warning', { extra: { itemCount: 3 }, tags })

		expect(mocks.scope.setTags).toHaveBeenCalledWith({ ...tags, severity: 'medium' })
		expect(mocks.scope.setExtra).toHaveBeenCalledWith('itemCount', 3)
		expect(mocks.captureMessage).toHaveBeenCalledWith('completed', 'warning')
	})

	it('adds breadcrumbs with defaults and a Sentry timestamp', () => {
		vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000)

		addBreadcrumb('loading items')

		expect(mocks.addBreadcrumb).toHaveBeenCalledWith({
			message: 'loading items',
			category: 'processing',
			level: 'info',
			data: undefined,
			timestamp: 1_700_000_000,
		})
	})

	it('sets the current user context', () => {
		const user = { email: 'user@example.com', id: 'user-id', role: 'admin' }

		setUser(user)

		expect(mocks.setUser).toHaveBeenCalledWith(user)
	})
})
