import { describe, expect, it } from 'vitest'

import {
	createPatternSignature,
	parseDestinationTemplate,
	parsePatternOrigin,
	PatternSyntaxError,
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

	it('normalizes repeated slashes while preserving a deliberate trailing slash', () => {
		expect(parsePatternOrigin('//legacy///:slug//').normalized).toBe('/legacy/:slug/')
	})

	it.each([
		'legacy/:slug',
		'/legacy/:slug with-space',
		'/legacy\\:slug',
		'/legacy/\t:slug',
		'/legacy/\u007f:slug',
		'/legacy/%2e%2e/:slug',
	])('rejects unsafe path input %s with a pattern syntax error', (value) => {
		expect(() => parsePatternOrigin(value)).toThrow(PatternSyntaxError)
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
		expect(createPatternSignature(parsePatternOrigin('/foo/:slug?'))).not.toBe(
			createPatternSignature(parsePatternOrigin('/foo/:slug')),
		)
		expect(createPatternSignature(parsePatternOrigin('/foo/:slug/'))).not.toBe(
			createPatternSignature(parsePatternOrigin('/foo/:slug')),
		)
	})
})
