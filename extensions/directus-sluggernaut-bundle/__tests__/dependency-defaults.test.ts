import { describe, expect, it } from 'vitest'

import { isLiteralDependencyDefault } from '../src/shared/configuration/dependency-defaults'

describe('literal dependency defaults', () => {
	it.each(['Article (news)', 'Category (EN)', 'Foo (bar)', 'article', '', false, 0])(
		'accepts literal %j',
		(value) => {
			expect(isLiteralDependencyDefault(value)).toBe(true)
		},
	)
	it.each([
		'now()',
		' now () ',
		'gen_random_uuid()',
		'gen_random_uuid ()',
		'CURRENT_TIMESTAMP',
		'CURRENT_TIMESTAMP (6)',
		'CURRENT_DATE',
		'CURRENT_TIME',
		'public.custom_function()',
		null,
		undefined,
		{},
		[],
		Infinity,
	])('excludes unresolved default %j', (value) => {
		expect(isLiteralDependencyDefault(value)).toBe(false)
	})
})
