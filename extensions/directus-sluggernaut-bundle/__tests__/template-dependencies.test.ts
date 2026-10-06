import type { SluggernautFieldMetadata } from '../src/shared/configuration/types'

import { describe, expect, it } from 'vitest'

import { discoverCollectionConfiguration } from '../src/shared/configuration/discovery'
import { isSupportedTemplateDependency } from '../src/shared/configuration/template-dependencies'
import { coordinateMutation } from '../src/sluggernaut-hook/mutation/coordinator'

/**
 * Discovers a generated permalink referencing one test dependency.
 * @param dependency - Field metadata to validate.
 * @returns Discovered configuration and warnings.
 */
function discover(dependency: SluggernautFieldMetadata) {
	return discoverCollectionConfiguration([
		dependency,
		{
			field: 'route',
			type: 'string',
			meta: { interface: 'sluggernaut-permalink', options: { pathTemplate: '/{{value}}' } },
		},
	])
}

/**
 * Verifies that unsupported metadata excludes the permalink regardless of explicit input.
 * @param field - Unsupported dependency metadata.
 * @returns Nothing.
 */
function expectExcluded(field: SluggernautFieldMetadata): void {
	const result = discover(field)
	expect(result.permalinks).toEqual([])
	expect(result.warnings).toContainEqual(
		expect.objectContaining({ field: 'route', code: 'invalid-template-reference' }),
	)
	expect(
		coordinateMutation({
			kind: 'create',
			payload: { value: 'explicit' },
			existingItem: {},
			configuration: result,
		}).payload,
	).toEqual({ value: 'explicit' })
}

describe('conservative template dependencies', () => {
	it.each([
		{ has_auto_increment: true },
		{ is_generated: true },
		{ generation_expression: 'title || type' },
		{ foreign_key_table: 'categories' },
	])('rejects generation and relation metadata %j', (schema) => {
		expectExcluded({ field: 'value', type: 'integer', schema })
	})

	it.each([
		'uuid',
		'date-created',
		'date-updated',
		'user-created',
		'user-updated',
		'role-created',
		'role-updated',
		'cast-boolean',
		'future-directus-special',
	])('rejects every nonempty special flag: %s', (special) => {
		expectExcluded({ field: 'value', type: 'string', meta: { special: [special] } })
	})

	it.each([
		'string',
		'text',
		'integer',
		'bigInteger',
		'float',
		'decimal',
		'boolean',
		'date',
		'time',
		'dateTime',
		'timestamp',
		'uuid',
	])('accepts plain scalar %s', (type) => {
		const field = {
			field: 'value',
			type,
			meta: { special: [] },
			schema: {
				has_auto_increment: false,
				is_generated: false,
				generation_expression: null,
				default_value: null,
			},
		}
		expect(isSupportedTemplateDependency(field, new Set())).toBe(true)
		expect(discover(field).warnings).toEqual([])
		expect(discover(field).permalinks).toHaveLength(1)
	})

	it.each([
		'article',
		'Article (news)',
		'Category (EN)',
		'foo(bar)',
		'',
		0,
		false,
		'CURRENT_TIMESTAMP',
		'now()',
		'AUTO_INCREMENT',
		"nextval('items_id_seq'::regclass)",
		{},
		[],
	])('rejects every non-null default without interpreting it: %j', (defaultValue) => {
		expectExcluded({ field: 'value', type: 'string', schema: { default_value: defaultValue } })
	})

	it.each([undefined, null])('accepts absent/null default %j', (defaultValue) => {
		expect(
			discover({ field: 'value', type: 'string', schema: { default_value: defaultValue } })
				.permalinks,
		).toHaveLength(1)
	})

	it.each(['json', 'alias', 'future-scalar', undefined])(
		'rejects unsupported type %s',
		(type) => {
			expectExcluded({ field: 'value', type })
		},
	)

	it.each([
		{ field: 'title', type: 'string', schema: { default_value: 'Untitled' } },
		{ field: 'title', type: 'string', meta: { special: ['future-special'] } },
		{ field: 'title', type: 'integer', schema: { has_auto_increment: true } },
		{ field: 'title', type: 'string', schema: { is_generated: true } },
		{ field: 'title', type: 'string', schema: { foreign_key_table: 'other' } },
		{ field: 'title', type: 'alias' },
	])('rejects a derived slug with unsupported source metadata %j', (title) => {
		const result = discoverCollectionConfiguration([
			title,
			{
				field: 'value',
				type: 'string',
				meta: { interface: 'sluggernaut-slug', options: { sourceFields: ['title'] } },
			},
			{
				field: 'route',
				type: 'string',
				meta: {
					interface: 'sluggernaut-permalink',
					options: { pathTemplate: '/{{value}}' },
				},
			},
		])
		expect(result.slugs).toHaveLength(1)
		expect(result.permalinks).toEqual([])
		expect(result.warnings).toContainEqual(
			expect.objectContaining({ code: 'invalid-template-reference' }),
		)
	})

	it('rejects slug-to-slug source chains in templates', () => {
		const result = discoverCollectionConfiguration([
			{ field: 'base', type: 'string' },
			{
				field: 'title',
				type: 'string',
				meta: { interface: 'sluggernaut-slug', options: { sourceFields: ['base'] } },
			},
			{
				field: 'value',
				type: 'string',
				meta: { interface: 'sluggernaut-slug', options: { sourceFields: ['title'] } },
			},
			{
				field: 'route',
				type: 'string',
				meta: {
					interface: 'sluggernaut-permalink',
					options: { pathTemplate: '/{{value}}' },
				},
			},
		])
		expect(result.slugs).toHaveLength(2)
		expect(result.permalinks).toEqual([])
		expect(result.warnings).toContainEqual(
			expect.objectContaining({ code: 'invalid-template-reference' }),
		)
	})

	it('accepts a derived slug with plain source metadata', () => {
		const result = discoverCollectionConfiguration([
			{ field: 'title', type: 'string' },
			{
				field: 'value',
				type: 'string',
				meta: { interface: 'sluggernaut-slug', options: { sourceFields: ['title'] } },
			},
			{
				field: 'route',
				type: 'string',
				meta: {
					interface: 'sluggernaut-permalink',
					options: { pathTemplate: '/{{value}}' },
				},
			},
		])
		expect(result.warnings).toEqual([])
		expect(
			coordinateMutation({
				kind: 'create',
				payload: { title: 'Some test' },
				existingItem: {},
				configuration: result,
			}).payload.route,
		).toBe('/some-test')
	})
})
