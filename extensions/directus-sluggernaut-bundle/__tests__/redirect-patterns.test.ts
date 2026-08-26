import { describe, expect, it } from 'vitest'

import {
	createPatternSignature,
	createPatternSpecificity,
	derivePatternMetadata,
	parseDestinationTemplate,
	parsePatternOrigin,
	PATTERN_SPECIFICITY_SEGMENT_LIMIT,
	validatePatternDestination,
	validatePatternRedirect,
} from '../src/sluggernaut-hook/redirects/patterns'

describe('redirect pattern grammar', () => {
	it.each([
		'/legacy/:slug',
		'/:category/:slug',
		'/:slug?',
		'/files/*',
		'/files/*?',
		'/files/:name.pdf',
	])('accepts supported pattern %s', (value) => {
		const result = parsePatternOrigin(value)
		expect(result.isPattern).toBe(true)
		expect(result.normalized).toBe(value)
	})

	it('normalizes repeated slashes and ignores a non-root trailing slash', () => {
		const result = parsePatternOrigin('//legacy///:slug//')
		expect(result.normalized).toBe('/legacy/:slug')
		expect(result.trailingSlash).toBe(false)
	})

	it('keeps root paths canonical', () => {
		const result = parseDestinationTemplate('///')
		expect(result.normalized).toBe('/')
		expect(result.trailingSlash).toBe(false)
	})

	it.each([
		'legacy/:slug',
		'/legacy/:slug with-space',
		'/legacy\\:slug',
		'/legacy/\t:slug',
		'/legacy/\u007f:slug',
		'/legacy/%2e%2e/:slug',
	])('rejects unsafe path input %s with a pattern syntax error', (value) => {
		expect(() => parsePatternOrigin(value)).toThrow()
	})

	it.each([
		'/foo/bar',
		'/legacy/:slug/:slug',
		'/files/*/*',
		'/legacy/foo:bar',
		'/legacy/foo*bar',
		'/legacy/foo?bar',
		'/legacy/:1slug',
		'/legacy/:slug?pdf',
		'/legacy/(slug)',
		'/legacy/:slug|:other',
		'/legacy/:slug?draft=true',
		'/legacy/:slug#section',
		'/legacy/../:slug',
	])('rejects unsupported pattern %s', (value) => {
		expect(() => parsePatternOrigin(value)).toThrow()
	})

	it('captures named parameters, wildcard state, and static suffixes', () => {
		const result = parsePatternOrigin('/files/:name.pdf/*?')
		expect(result.parameters.get('name')).toMatchObject({
			kind: 'parameter',
			name: 'name',
			optional: false,
			suffix: '.pdf',
		})
		expect(result.wildcard).toEqual({ kind: 'wildcard', optional: true })
	})
})

describe('pattern destination validation', () => {
	it('accepts named and wildcard interpolation backed by the origin', () => {
		expect(() => validatePatternRedirect('/legacy/:slug', '/articles/:slug')).not.toThrow()
		expect(() => validatePatternRedirect('/files/*', '/assets/*')).not.toThrow()
		expect(() => validatePatternRedirect('/:version?', '/docs/:version?')).not.toThrow()
	})

	it.each([
		['/legacy/:slug', '/articles/:id'],
		['/legacy/:slug', '/articles/*'],
		['/files/*', '/assets/:slug'],
		['/:version?', '/docs/:version'],
		['/files/*?', '/assets/*'],
	])('rejects unsafe destination %s -> %s', (origin, destination) => {
		expect(() => validatePatternRedirect(origin, destination)).toThrow()
	})

	it('rejects query strings, fragments, and external destinations', () => {
		const origin = parsePatternOrigin('/legacy/:slug')
		for (const destination of [
			'/articles/:slug?draft=true',
			'/articles/:slug#section',
			'https://example.com/articles/:slug',
		])
			expect(() =>
				validatePatternDestination(origin, parseDestinationTemplate(destination)),
			).toThrow()
	})

	it('creates equivalent signatures without parameter names', () => {
		expect(createPatternSignature(parsePatternOrigin('/foo/:id'))).toBe(
			createPatternSignature(parsePatternOrigin('/foo/:slug')),
		)
		expect(createPatternSignature(parsePatternOrigin('/News/:slug'))).toBe(
			createPatternSignature(parsePatternOrigin('/news/:id')),
		)
		expect(createPatternSignature(parsePatternOrigin('/Files/:name.PDF'))).toBe(
			createPatternSignature(parsePatternOrigin('/files/:slug.pdf')),
		)
		expect(createPatternSignature(parsePatternOrigin('/foo/:slug?'))).not.toBe(
			createPatternSignature(parsePatternOrigin('/foo/:slug')),
		)
		expect(createPatternSignature(parsePatternOrigin('/foo/:slug/'))).toBe(
			createPatternSignature(parsePatternOrigin('/foo/:slug')),
		)
	})
})

describe('pattern specificity and metadata', () => {
	it('ranks route structures according to the public precedence order', () => {
		const values = [
			'/legacy/archive/:slug',
			'/legacy/:slug.pdf',
			'/legacy/:slug',
			'/legacy/:slug?',
			'/legacy/*',
			'/legacy/*?',
		].map((value) => BigInt(createPatternSpecificity(parsePatternOrigin(value))))

		for (let index = 1; index < values.length; index += 1) {
			const previous = values[index - 1]
			const current = values[index]
			expect(previous).toBeDefined()
			expect(current).toBeDefined()
			if (previous !== undefined && current !== undefined)
				expect(previous).toBeGreaterThan(current)
		}
	})

	it('returns a decimal string that fits within the 64-bit database representation', () => {
		const origin = `/${Array.from({ length: PATTERN_SPECIFICITY_SEGMENT_LIMIT }, (_, index) =>
			index === 19 ? ':slug' : 'static',
		).join('/')}`
		const specificity = createPatternSpecificity(parsePatternOrigin(origin))
		expect(specificity).toMatch(/^\d+$/u)
		expect(BigInt(specificity)).toBeLessThan(2n ** 64n)
	})

	it('rejects origins beyond the lossless specificity segment limit', () => {
		const origin = `/${Array.from(
			{ length: PATTERN_SPECIFICITY_SEGMENT_LIMIT + 1 },
			(_, index) => (index === PATTERN_SPECIFICITY_SEGMENT_LIMIT ? ':slug' : 'static'),
		).join('/')}`

		expect(() => createPatternSpecificity(parsePatternOrigin(origin))).toThrow(
			/at most 20 segments/u,
		)
	})

	it('derives normalized paths, signatures, and persisted specificity together', () => {
		expect(derivePatternMetadata('//legacy///:slug//', '/articles//:slug')).toMatchObject({
			origin: '/legacy/:slug',
			destination: '/articles/:slug',
			matcher_signature: expect.any(String),
			specificity: expect.stringMatching(/^\d+$/u),
		})
	})

	it('keeps the derived signature within the schema limit for the longest origin', () => {
		const origin = `/${'a'.repeat(251)}/:x`
		const metadata = derivePatternMetadata(origin, '/articles/:x')

		expect(origin.length).toBe(255)
		expect(metadata.matcher_signature.length).toBeLessThanOrEqual(512)
	})

	it('propagates origin and destination validation failures through metadata derivation', () => {
		expect(() => derivePatternMetadata('/legacy/:slug', '/articles/:id')).toThrow(
			/unknown parameter/u,
		)
		expect(() => derivePatternMetadata('/legacy/:slug', '/articles/:slug?draft=true')).toThrow()
	})
})
