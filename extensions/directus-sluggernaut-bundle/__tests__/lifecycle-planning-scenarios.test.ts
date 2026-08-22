import type { Redirect } from '../src/sluggernaut-hook/redirects/schema'

import { describe, expect, it } from 'vitest'

import {
	planArchiveReactivation,
	planLifecycleDeactivation,
} from '../src/sluggernaut-hook/redirects/history/planner'

const redirect = (overrides: Partial<Redirect> = {}): Redirect => ({
	id: 'redirect',
	origin: '/old',
	destination: '/previous',
	type: 301,
	date_created: '2025-03-17T15:19:35.672Z',
	date_updated: null,
	user_created: null,
	user_updated: null,
	start_date: null,
	end_date: null,
	match: 'exact',
	specificity: null,
	matcher_signature: null,
	is_active: true,
	managed_by: 'sluggernaut',
	source_collection: 'articles',
	source_item: '1',
	source_field: 'route',
	source_type: 'permalink',
	inactive_reason: null,
	...overrides,
})

describe('Lifecycle planning scenarios', () => {
	it('deactivates active managed history with the archive reason', () => {
		expect(
			planLifecycleDeactivation(
				[redirect(), redirect({ id: 'inactive', is_active: false })],
				'archived',
			),
		).toEqual([{ id: 'redirect', inactive_reason: 'archived' }])
	})

	it('reactivates only archive-suspended history', () => {
		expect(
			planArchiveReactivation([
				redirect({ id: 'archived', is_active: false, inactive_reason: 'archived' }),
				redirect({ id: 'deleted', is_active: false, inactive_reason: 'deleted' }),
			]),
		).toEqual([{ id: 'archived', is_active: true, inactive_reason: null }])
	})

	it('keep lifecycle planning empty, ordered, and idempotent when appropriate', () => {
		expect(planLifecycleDeactivation([], 'deleted')).toEqual([])
		expect(planArchiveReactivation([])).toEqual([])
		expect(planLifecycleDeactivation([redirect()], 'deleted')).toEqual([
			{ id: 'redirect', inactive_reason: 'deleted' },
		])
		expect(
			planArchiveReactivation([redirect({ is_active: false, inactive_reason: null })]),
		).toEqual([])
		expect(planLifecycleDeactivation([redirect()], 'archived')).toEqual([
			{ id: 'redirect', inactive_reason: 'archived' },
		])
	})
})
