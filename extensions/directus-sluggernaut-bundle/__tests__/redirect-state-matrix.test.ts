import type { Redirect, RedirectSource } from '../src/sluggernaut-hook/redirects/schema'

import { describe, expect, it } from 'vitest'

import { decideRedirectOwnership } from '../src/sluggernaut-hook/redirects/domain/ownership'
import {
	planArchiveReactivation,
	planCanonicalRedirect,
	planLifecycleDeactivation,
} from '../src/sluggernaut-hook/redirects/history/planner'

const source = {
	type: 'permalink' as const,
	field: 'route',
	includeUnmanagedRedirectsInPlanning: true,
	unmanagedRedirectConflictBehavior: 'override' as const,
}

function redirect(overrides: Partial<Redirect> = {}): Redirect {
	const managed = overrides.managed_by === 'sluggernaut'
	return {
		id: 'redirect',
		origin: '/old',
		destination: '/previous',
		type: 301,
		match: 'exact',
		specificity: null,
		matcher_signature: null,
		is_active: true,
		start_date: null,
		end_date: null,
		managed_by: managed ? 'sluggernaut' : null,
		source_collection: managed ? 'articles' : null,
		source_item: managed ? '1' : null,
		source_field: managed ? 'route' : null,
		source_type: managed ? 'permalink' : null,
		inactive_reason: null,
		user_created: null,
		date_created: '2026-01-01T00:00:00.000Z',
		user_updated: null,
		date_updated: null,
		...overrides,
	}
}

function plan(
	existingRedirects: readonly Redirect[] = [],
	redirectSource: RedirectSource = source,
) {
	return planCanonicalRedirect({
		oldCanonical: '/old',
		newCanonical: '/new',
		source: redirectSource,
		source_collection: 'articles',
		source_item: 1,
		existingRedirects,
	})
}

describe('redirect state matrix', () => {
	it.each([
		{
			name: 'no existing record',
			records: [],
			expectation: {
				create: true,
				rewrite: [],
				reactivate: [],
				deactivate: [],
				warnings: [],
			},
		},
		{
			name: 'active managed record owned by the same source',
			records: [redirect({ id: 'owned', managed_by: 'sluggernaut' })],
			expectation: { create: false, rewrite: [{ id: 'owned', destination: '/new' }] },
		},
		{
			name: 'active managed record owned by another source',
			records: [
				redirect({
					id: 'other-source',
					managed_by: 'sluggernaut',
					source_collection: 'other_articles',
					source_item: '2',
				}),
			],
			expectation: { create: false, rewrite: [{ id: 'other-source', destination: '/new' }] },
		},
		{
			name: 'active manual record with default override policy',
			records: [redirect({ id: 'manual', managed_by: null })],
			expectation: { create: false, rewrite: [{ id: 'manual', destination: '/new' }] },
		},
		{
			name: 'active manual record with block policy',
			records: [redirect({ id: 'manual', managed_by: null })],
			source: { ...source, unmanagedRedirectConflictBehavior: 'block' as const },
			expectation: { create: false, rewrite: [], warnings: [expect.any(String)] },
		},
		{
			name: 'manual record excluded from planning',
			records: [redirect({ id: 'manual', managed_by: null })],
			source: { ...source, includeUnmanagedRedirectsInPlanning: false },
			expectation: { create: true, rewrite: [], warnings: [] },
		},
		{
			name: 'inactive manual conflict',
			records: [redirect({ id: 'inactive-manual', managed_by: null, is_active: false })],
			expectation: { create: true, rewrite: [], deactivate: [] },
		},
		{
			name: 'archived managed history',
			records: [
				redirect({
					id: 'archived',
					managed_by: 'sluggernaut',
					is_active: false,
					inactive_reason: 'archived',
				}),
			],
			expectation: { create: true, rewrite: [], reactivate: [], deactivate: [] },
		},
		{
			name: 'deleted managed history',
			records: [
				redirect({
					id: 'deleted',
					managed_by: 'sluggernaut',
					is_active: false,
					inactive_reason: 'deleted',
				}),
			],
			expectation: { create: true, rewrite: [], reactivate: [], deactivate: [] },
		},
		{
			name: 'loop-suppressed managed history on a canonical reversal',
			records: [
				redirect({
					id: 'suppressed',
					managed_by: 'sluggernaut',
					is_active: false,
					inactive_reason: null,
				}),
			],
			expectation: {
				create: false,
				rewrite: [{ id: 'suppressed', destination: '/new' }],
				reactivate: [{ id: 'suppressed' }],
			},
		},
		{
			name: 'pattern record at the old origin',
			records: [redirect({ id: 'pattern', match: 'pattern', managed_by: null })],
			expectation: { create: true, rewrite: [] },
		},
	] as const)('$name', ({ records, source: redirectSource, expectation }) => {
		const result = plan(records, redirectSource)
		if ('create' in expectation) {
			if (expectation.create) expect(result.create).not.toBeNull()
			else expect(result.create).toBeNull()
		}
		if ('rewrite' in expectation) expect(result.rewrite).toEqual(expectation.rewrite)
		if ('reactivate' in expectation) expect(result.reactivate).toEqual(expectation.reactivate)
		if ('deactivate' in expectation) expect(result.deactivate).toEqual(expectation.deactivate)
		if ('warnings' in expectation) expect(result.warnings).toEqual(expectation.warnings)
	})

	it.each([
		{
			name: 'active manual predecessor included',
			record: redirect({
				id: 'manual-predecessor',
				origin: '/before',
				destination: '/old',
				managed_by: null,
			}),
			expectation: [{ id: 'manual-predecessor', destination: '/new' }],
		},
		{
			name: 'inactive manual predecessor ignored',
			record: redirect({
				id: 'inactive-predecessor',
				origin: '/before',
				destination: '/old',
				managed_by: null,
				is_active: false,
			}),
			expectation: [],
		},
		{
			name: 'archived managed predecessor ignored',
			record: redirect({
				id: 'archived-predecessor',
				origin: '/before',
				destination: '/old',
				managed_by: 'sluggernaut',
				is_active: false,
				inactive_reason: 'archived',
			}),
			expectation: [],
		},
		{
			name: 'active manual predecessor excluded',
			record: redirect({
				id: 'excluded-predecessor',
				origin: '/before',
				destination: '/old',
				managed_by: null,
			}),
			source: { ...source, includeUnmanagedRedirectsInPlanning: false },
			expectation: [],
		},
	] as const)('$name', ({ record, source: redirectSource, expectation }) => {
		expect(plan([record], redirectSource).rewrite).toEqual(expectation)
	})

	it.each([
		{
			name: 'active manual loop target included',
			record: redirect({ id: 'manual-loop', origin: '/new', managed_by: null }),
			expected: [{ id: 'manual-loop', inactive_reason: null }],
		},
		{
			name: 'inactive manual loop target ignored',
			record: redirect({
				id: 'inactive-manual-loop',
				origin: '/new',
				managed_by: null,
				is_active: false,
			}),
			expected: [],
		},
		{
			name: 'archived managed loop target ignored',
			record: redirect({
				id: 'archived-loop',
				origin: '/new',
				managed_by: 'sluggernaut',
				is_active: false,
				inactive_reason: 'archived',
			}),
			expected: [],
		},
	] as const)('$name', ({ record, expected }) => {
		expect(plan([record]).deactivate).toEqual(expected)
	})

	it('handles lifecycle states without crossing the manual ownership boundary', () => {
		const records = [
			redirect({ id: 'active-managed', managed_by: 'sluggernaut' }),
			redirect({ id: 'active-manual', managed_by: null }),
			redirect({
				id: 'archived-managed',
				managed_by: 'sluggernaut',
				is_active: false,
				inactive_reason: 'archived',
			}),
			redirect({
				id: 'deleted-managed',
				managed_by: 'sluggernaut',
				is_active: false,
				inactive_reason: 'deleted',
			}),
		]
		expect(planLifecycleDeactivation(records, 'archived')).toEqual([
			{ id: 'active-managed', inactive_reason: 'archived' },
		])
		expect(planArchiveReactivation(records)).toEqual([
			{ id: 'archived-managed', is_active: true, inactive_reason: null },
		])
	})

	it.each([
		{
			name: 'external operational edit',
			source: 'external' as const,
			proposed: { ...redirect({ managed_by: 'sluggernaut' }), is_active: false },
			expected: false,
		},
		{
			name: 'external structural edit',
			source: 'external' as const,
			proposed: { ...redirect({ managed_by: 'sluggernaut' }), destination: '/changed' },
			expected: true,
		},
		{
			name: 'internal structural edit',
			source: 'internal' as const,
			proposed: { ...redirect({ managed_by: 'sluggernaut' }), destination: '/changed' },
			expected: false,
		},
		{
			name: 'manual structural edit on manual record',
			source: 'external' as const,
			proposed: { ...redirect({ managed_by: null }), destination: '/changed' },
			expected: false,
		},
	] as const)('$name', ({ source: mutationSource, proposed, expected }) => {
		const existing = redirect({ managed_by: proposed.managed_by })
		expect(decideRedirectOwnership(existing, proposed, mutationSource).transfersOwnership).toBe(
			expected,
		)
	})
})
