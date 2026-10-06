import type {
	CollectionConfiguration,
	PermalinkInterfaceOptions,
	SluggernautFieldMetadata,
} from '../src/shared/configuration/types'

import { describe, expect, it } from 'vitest'

import { discoverCollectionConfiguration } from '../src/shared/configuration/discovery'
import { compilePathTemplate, renderPathTemplate } from '../src/shared/values/path-template'
import { coordinateMutation } from '../src/sluggernaut-hook/mutation/coordinator'
import { hasRelevantPayloadField, relevantFields } from '../src/sluggernaut-hook/mutation/items'
import {
	planCanonicalRedirect,
	selectRedirectSource,
	canonicalUrlForItem,
} from '../src/sluggernaut-hook/redirects/history/planner'
import { requiredItemFields } from '../src/sluggernaut-recalculate/selection'

const options: PermalinkInterfaceOptions = {
	generateFromTemplate: true,
	pathTemplate: '/{{type}}/{{ slug }}',
	updateOnDependencyChange: true,
	trailingSlash: false,
	enforceTrailingSlashOnManualInput: false,
	automaticRedirects: true,
}
const fields: SluggernautFieldMetadata[] = [
	{ field: 'title', type: 'string' },
	{ field: 'type', type: 'string' },
	{
		field: 'slug',
		type: 'string',
		meta: { interface: 'sluggernaut-slug', options: { sourceFields: ['title'] } },
	},
	{
		field: 'route',
		type: 'string',
		meta: { interface: 'sluggernaut-permalink', options: { ...options } },
	},
]
const configuration = discoverCollectionConfiguration(fields)

/**
 * Builds a template configuration with selected option overrides.
 * @param overrides - Generation options to override.
 * @returns Collection configuration for this scenario.
 */
function configured(overrides: Partial<PermalinkInterfaceOptions>): CollectionConfiguration {
	return {
		...configuration,
		permalinks: configuration.permalinks.map((field) => ({
			...field,
			options: { ...field.options, ...overrides },
		})),
	}
}

describe('dynamic permalink templates', () => {
	it('discovers dependencies for update detection and existing-item/recalculation reads', () => {
		expect(configuration.warnings).toEqual([])
		expect([...compilePathTemplate(options).dependencies]).toEqual(['type', 'slug'])
		expect(relevantFields(configuration)).toContain('type')
		expect(requiredItemFields('id', configuration)).toContain('type')
		expect(hasRelevantPayloadField({ type: 'news' }, configuration)).toBe(true)
	})

	it.each([
		{
			payload: { title: 'Some test' },
			kind: 'create',
			existingItem: {},
			expected: '/article/some-test',
		},
		{
			payload: { title: 'Some test', type: 'news' },
			kind: 'create',
			existingItem: {},
			expected: '/news/some-test',
		},
		{
			payload: { title: 'Some test', type: null },
			kind: 'create',
			existingItem: {},
			expected: null,
		},
		{
			payload: { title: 'Some test' },
			kind: 'update',
			existingItem: { type: 'news' },
			expected: '/news/some-test',
		},
		{
			payload: { title: 'Some test' },
			kind: 'update',
			existingItem: { type: null },
			expected: null,
		},
	])(
		'resolves omitted defaults only on create: $kind $expected',
		({ payload, kind, existingItem, expected }) => {
			const withDefaults = discoverCollectionConfiguration(
				fields.map((field) =>
					field.field === 'type'
						? { ...field, schema: { default_value: 'article' } }
						: field,
				),
			)
			expect(
				coordinateMutation({
					kind: kind === 'create' ? 'create' : 'update',
					payload,
					existingItem,
					configuration: withDefaults,
				}).payload.route,
			).toBe(expected)
		},
	)

	it.each(['Article (news)', 'Category (EN)', 'Foo (bar)'])(
		'uses literal string default containing parentheses: %s',
		(defaultValue) => {
			const withDefaults = discoverCollectionConfiguration(
				fields.map((field) =>
					field.field === 'type'
						? { ...field, schema: { default_value: defaultValue } }
						: field,
				),
			)
			const permalink = withDefaults.permalinks[0]
			if (!permalink) throw new Error('Expected discovered permalink')
			permalink.options.templateVariables = [
				{ name: 'type', field: 'type', transforms: [{ type: 'slugify' }] },
			]
			expect(
				coordinateMutation({
					kind: 'create',
					payload: { title: 'Some test' },
					existingItem: {},
					configuration: withDefaults,
				}).payload.route,
			).toBe(
				`/${defaultValue === 'Article (news)' ? 'article-news' : defaultValue === 'Category (EN)' ? 'category-en' : 'foo-bar'}/some-test`,
			)
		},
	)

	it.each([
		'now()',
		'CURRENT_TIMESTAMP',
		'CURRENT_TIMESTAMP(6)',
		'CURRENT_DATE',
		'gen_random_uuid()',
		null,
		{},
		[],
	])('does not render a database expression or non-scalar default %j', (defaultValue) => {
		const withDefaults = discoverCollectionConfiguration(
			fields.map((field) =>
				field.field === 'type'
					? { ...field, schema: { default_value: defaultValue } }
					: field,
			),
		)
		expect(
			coordinateMutation({
				kind: 'create',
				payload: { title: 'Some test' },
				existingItem: {},
				configuration: withDefaults,
			}).payload.route,
		).toBeNull()
	})

	it.each([false, 0])(
		'preserves scalar default %j without adding it to the payload',
		(defaultValue) => {
			const withDefaults = discoverCollectionConfiguration(
				fields.map((field) =>
					field.field === 'type'
						? { ...field, schema: { default_value: defaultValue } }
						: field,
				),
			)
			const result = coordinateMutation({
				kind: 'create',
				payload: { title: 'Some test' },
				existingItem: {},
				configuration: withDefaults,
			}).payload
			expect(result.route).toBe(`/${defaultValue}/some-test`)
			expect(result).not.toHaveProperty('type')
		},
	)

	it('ignores stale hidden template settings in standalone mode without bypassing normalization or redirects', () => {
		const standalone = discoverCollectionConfiguration(
			fields.map((field) =>
				field.field === 'route'
					? {
							...field,
							meta: {
								...field.meta,
								options: {
									...options,
									generateFromTemplate: false,
									pathTemplate: 123,
									templateVariables: [{ malformed: true }],
									updateOnDependencyChange: 'invalid',
								},
							},
						}
					: field,
			),
		)
		expect(standalone.warnings).toEqual([])
		expect(standalone.permalinks).toHaveLength(1)
		const result = coordinateMutation({
			kind: 'create',
			payload: { route: ' /manual/path ' },
			existingItem: {},
			configuration: standalone,
		})
		expect(result.payload.route).toBe('/manual/path')
		const source = selectRedirectSource(standalone)
		expect(source).toMatchObject({ field: 'route', type: 'permalink' })
		if (!source) throw new Error('Expected standalone redirect source')
		expect(canonicalUrlForItem(source, result.payload)).toBe('/manual/path')
	})

	it.each([true, undefined])(
		'validates template-only settings when generation is %j',
		(generateFromTemplate) => {
			const invalid = discoverCollectionConfiguration(
				fields.map((field) =>
					field.field === 'route'
						? {
								...field,
								meta: {
									...field.meta,
									options: {
										...options,
										generateFromTemplate,
										templateVariables: [{ malformed: true }],
									},
								},
							}
						: field,
				),
			)
			expect(invalid.permalinks).toEqual([])
			expect(invalid.warnings).toContainEqual(
				expect.objectContaining({ field: 'route', code: 'invalid-interface-options' }),
			)
		},
	)

	it('still validates shared options in standalone mode', () => {
		const invalid = discoverCollectionConfiguration(
			fields.map((field) =>
				field.field === 'route'
					? {
							...field,
							meta: {
								...field.meta,
								options: { generateFromTemplate: false, trailingSlash: 'invalid' },
							},
						}
					: field,
			),
		)
		expect(invalid.permalinks).toEqual([])
		expect(invalid.warnings).toContainEqual(
			expect.objectContaining({ field: 'route', code: 'invalid-interface-options' }),
		)
	})

	it.each([
		{
			kind: 'create',
			payload: {},
			existingItem: {},
			slug: 'untitled',
			route: '/article/untitled',
		},
		{
			kind: 'create',
			payload: { title: 'Explicit' },
			existingItem: {},
			slug: 'explicit',
			route: '/article/explicit',
		},
		{ kind: 'create', payload: { title: null }, existingItem: {}, slug: null, route: null },
		{ kind: 'create', payload: { slug: null }, existingItem: {}, slug: null, route: null },
		{
			kind: 'update',
			payload: { type: 'news' },
			existingItem: { title: 'Existing', slug: 'existing' },
			slug: undefined,
			route: '/news/existing',
		},
		{
			kind: 'recalculate',
			payload: {},
			existingItem: { title: null, type: 'news' },
			slug: null,
			route: null,
		},
	])(
		'resolves literal slug source defaults only on create: $kind $route',
		({ kind, payload, existingItem, slug, route }) => {
			const withDefaults = discoverCollectionConfiguration(
				fields.map((field) =>
					field.field === 'title'
						? { ...field, schema: { default_value: 'Untitled' } }
						: field.field === 'type'
							? { ...field, schema: { default_value: 'article' } }
							: field,
				),
			)
			const result = coordinateMutation({
				kind: kind === 'create' ? 'create' : kind === 'update' ? 'update' : 'recalculate',
				payload,
				existingItem,
				configuration: withDefaults,
			}).payload
			expect(result.slug).toBe(slug)
			expect(result.route).toBe(route)
			expect(result).not.toHaveProperty('title', 'Untitled')
		},
	)

	it.each(['now()', 'gen_random_uuid()', 'CURRENT_TIMESTAMP'])(
		'does not derive a slug from SQL source default %s',
		(defaultValue) => {
			const withDefaults = discoverCollectionConfiguration(
				fields.map((field) =>
					field.field === 'title'
						? { ...field, schema: { default_value: defaultValue } }
						: field,
				),
			)
			expect(
				coordinateMutation({
					kind: 'create',
					payload: {},
					existingItem: {},
					configuration: withDefaults,
				}).payload.slug,
			).toBeNull()
		},
	)

	it('renders the slug generated during the same create and update', () => {
		expect(
			coordinateMutation({
				kind: 'create',
				payload: { title: 'Hello World', type: 'news' },
				existingItem: {},
				configuration,
			}).payload,
		).toMatchObject({ slug: 'hello-world', route: '/news/hello-world' })
		expect(
			coordinateMutation({
				kind: 'update',
				payload: { title: 'New title', type: 'articles' },
				existingItem: { title: 'Old', type: 'news', slug: 'old', route: '/news/old' },
				configuration,
			}).payload,
		).toMatchObject({ slug: 'new-title', route: '/articles/new-title' })
	})

	it('regenerates for a non-slug dependency and feeds the canonical redirect planner', () => {
		const existingItem = { title: 'Hello', type: 'news', slug: 'hello', route: '/news/hello' }
		const result = coordinateMutation({
			kind: 'update',
			payload: { type: 'articles' },
			existingItem,
			configuration,
		})
		expect(result.payload).toEqual({ type: 'articles', route: '/articles/hello' })
		const source = selectRedirectSource(configuration)
		if (source === null) throw new Error('Expected a canonical source')
		expect(
			planCanonicalRedirect({
				oldCanonical: canonicalUrlForItem(source, existingItem),
				newCanonical: canonicalUrlForItem(source, { ...existingItem, ...result.payload }),
				source,
				source_collection: 'articles',
				source_item: '1',
				existingRedirects: [],
			}).create,
		).toMatchObject({ origin: '/news/hello', destination: '/articles/hello', type: 301 })
	})

	it('preserves paths when synchronization is disabled or dependencies are unchanged', () => {
		const existingItem = { type: 'news', slug: 'hello', route: '/custom' }
		for (const [payload, current] of [
			[{ type: 'news' }, configuration],
			[{ type: 'articles' }, configured({ updateOnDependencyChange: false })],
		] satisfies [Record<string, unknown>, CollectionConfiguration][]) {
			expect(
				coordinateMutation({
					kind: 'update',
					payload,
					existingItem,
					configuration: current,
				}).payload.route,
			).toBeUndefined()
		}
	})

	it('always recalculates and keeps explicit manual input authoritative', () => {
		const current = configured({ updateOnDependencyChange: false, trailingSlash: true })
		expect(
			coordinateMutation({
				kind: 'recalculate',
				payload: {},
				existingItem: { title: 'Hello', type: 'news' },
				configuration: current,
			}).payload.route,
		).toBe('/news/hello/')
		expect(
			coordinateMutation({
				kind: 'create',
				payload: { type: 'news', title: 'Hello', route: '/custom' },
				existingItem: {},
				configuration: current,
			}).payload.route,
		).toBe('/custom')
	})

	it.each([undefined, null, '', '   '])(
		'returns null for missing required values (%s)',
		(type) => {
			expect(
				coordinateMutation({
					kind: 'create',
					payload: { title: 'Hello', type },
					existingItem: {},
					configuration,
				}).payload.route,
			).toBeNull()
		},
	)

	it('clears paths when a derived slug is cleared and does not use the stale stored slug', () => {
		expect(
			coordinateMutation({
				kind: 'update',
				payload: { title: null },
				existingItem: { title: 'Hello', type: 'news', slug: 'hello' },
				configuration,
			}).payload,
		).toMatchObject({ slug: null, route: null })
	})

	it('maps aliased variables and applies transformations in order', () => {
		const current = configured({
			pathTemplate: '/{{section}}/{{slug}}',
			templateVariables: [
				{
					name: 'section',
					field: 'type',
					transforms: [
						{ type: 'map', values: { NEWS: 'École News' } },
						{ type: 'slugify' },
						{ type: 'lowercase' },
					],
				},
			],
		})
		expect(
			coordinateMutation({
				kind: 'create',
				payload: { title: 'Hello', type: 'NEWS' },
				existingItem: {},
				configuration: current,
			}).payload.route,
		).toBe('/ecole-news/hello')
		expect(relevantFields(current)).toContain('type')
		expect(relevantFields(current)).not.toContain('section')
		expect(
			coordinateMutation({
				kind: 'create',
				payload: { title: 'Hello', type: 'unmapped' },
				existingItem: {},
				configuration: current,
			}).payload.route,
		).toBeNull()
	})

	it('lowercases before an exact mapping and rejects non-scalar item values', () => {
		const template = compilePathTemplate({
			pathTemplate: '/{{type}}',
			templateVariables: [
				{
					name: 'type',
					field: 'type',
					transforms: [
						{ type: 'lowercase' },
						{ type: 'map', values: { news: 'nieuws' } },
					],
				},
			],
		})
		expect(renderPathTemplate(template, { type: 'NEWS' }, {}, false)).toBe('/nieuws')
		for (const type of [{ value: 'news' }, ['news'], Number.NaN, Infinity]) {
			expect(() => renderPathTemplate(template, { type }, {}, false)).toThrow()
		}
	})

	it('supports numeric and boolean scalars, repeated placeholders, and literal-only paths', () => {
		const template = compilePathTemplate({ pathTemplate: '/{{year}}/{{enabled}}/{{year}}' })
		expect(renderPathTemplate(template, { year: 0, enabled: false }, {}, false)).toBe(
			'/0/false/0',
		)
		expect(
			renderPathTemplate(
				compilePathTemplate({ pathTemplate: '/docs//index' }),
				{},
				{},
				false,
			),
		).toBe('/docs/index')
	})

	it.each([
		'/foo/bar',
		'..',
		'.',
		'?query',
		'#hash',
		'\\path',
		'%2fpath',
		'%252fpath',
		'%2e%2e',
		'a b',
		'a\n',
		'%',
		'%FF',
	])('rejects unsafe interpolated segments: %s', (type) => {
		expect(() =>
			renderPathTemplate(compilePathTemplate(options), { type, slug: 'hello' }, {}, false),
		).toThrow()
	})

	it.each([
		'/{{category.slug}}/{{slug}}',
		'/{{type | lowercase}}',
		'/{{type}',
		'//{{type}}',
		'/bad?query/{{type}}',
		'/..',
		'https://example.com/{{type}}',
	])('rejects invalid template syntax or literals: %s', (pathTemplate) => {
		expect(() => compilePathTemplate({ pathTemplate })).toThrow()
	})

	it.each(['missing', 'category', 'json', 'alias', 'route', 'invalid_slug'])(
		'excludes invalid dependencies without disabling valid fields: %s',
		(dependency) => {
			const result = discoverCollectionConfiguration([
				...fields.filter((field) => field.field !== 'route'),
				{ field: 'category', type: 'integer', schema: { foreign_key_table: 'categories' } },
				{ field: 'json', type: 'json' },
				{ field: 'alias', type: 'alias' },
				{
					field: 'invalid_slug',
					type: 'string',
					meta: { interface: 'sluggernaut-slug', options: { sourceFields: ['missing'] } },
				},
				{
					field: 'route',
					type: 'string',
					meta: {
						interface: 'sluggernaut-permalink',
						options: { ...options, pathTemplate: `/{{${dependency}}}/{{slug}}` },
					},
				},
			])
			expect(result.slugs).toHaveLength(1)
			expect(result.permalinks).toEqual([])
			expect(result.warnings).toContainEqual(
				expect.objectContaining({ code: 'invalid-template-reference' }),
			)
		},
	)

	it('supports scalar field keys with Unicode letters and hyphens', () => {
		const template = compilePathTemplate({ pathTemplate: '/{{título}}/{{public-slug}}' })
		expect(
			renderPathTemplate(template, { título: 'news', 'public-slug': 'hello' }, {}, false),
		).toBe('/news/hello')
	})

	it('rejects malformed transformations, duplicate variables, and unused variable configuration', () => {
		for (const templateVariables of [
			[{ name: 'type', field: 'type', transforms: [{ type: 'unknown' }] }],
			[
				{ name: 'type', field: 'type' },
				{ name: 'type', field: 'title' },
			],
			[{ name: 'unused', field: 'type' }],
		]) {
			const result = discoverCollectionConfiguration(
				fields.map((field) =>
					field.field === 'route'
						? {
								...field,
								meta: { ...field.meta, options: { ...options, templateVariables } },
							}
						: field,
				),
			)
			expect(result.permalinks).toEqual([])
		}
	})
})
