import { describe, expect, it } from 'vitest'

import {
	applyTrailingSlash,
	combinePermalinkSourceValues,
	deriveSlug,
	normalizeHost,
	normalizeManualPermalink,
	normalizePermalink,
	normalizeSlug,
	resolveEffectiveFieldValue,
} from '../src/shared/values/normalization'

describe('Sluggernaut normalization', () => {
	it('covers falsy values, locale variants, punctuation, separators, and empty results', () => {
		expect(deriveSlug([0, false, null, undefined, '  A  ', 'B'], 'en', true)).toBe('a-b')
		expect(deriveSlug(['İSTANBUL'], 'tr', true)).toBe('istanbul')
		expect(deriveSlug(['Äë—hello___world!!!'], 'de', false)).toBe('Ae-hello-world')
		expect(deriveSlug(['---', '…'], 'en', true)).toBeNull()
		expect(deriveSlug(['Hello'], 'en', false)).toBe('Hello')
	})

	it('rejects non-string explicit slug values through the normalization boundary', () => {
		expect(deriveSlug([123])).toBeNull()
		expect(normalizeSlug(null)).toBeNull()
		expect(normalizeSlug('  ')).toBeNull()
	})
	it('derives a slug from multiple non-empty source values', () => {
		expect(deriveSlug([' Remí ', 'Huigen'], 'en', true)).toBe('remi-huigen')
	})

	it('uses locale-aware lowercasing without relying on truthiness', () => {
		expect(deriveSlug(['İstanbul'], 'tr', true)).toBe('istanbul')
		expect(combinePermalinkSourceValues([null, undefined, '', '  ', 'kept'])).toBe('kept')
		expect(combinePermalinkSourceValues(['News', 'Article'])).toBe('News-Article')
	})

	it('resolves the effective field value from payload or existing item', () => {
		expect(
			resolveEffectiveFieldValue({ title: null }, { title: 'Old title' }, 'title'),
		).toBeNull()
		expect(resolveEffectiveFieldValue({}, { title: 'Old title' }, 'title')).toBe('Old title')
	})

	it('validates absolute permalink paths', () => {
		expect(normalizePermalink('/news//hello')).toBe('/news/hello')
		expect(normalizePermalink('/')).toBe('/')
		expect(() => normalizePermalink('news/hello')).toThrow()
		expect(() => normalizePermalink('https://example.com/news')).toThrow()
		expect(() => normalizePermalink('/news?draft=true')).toThrow()
		expect(() => normalizePermalink('/hello/hello-worldasf  ASFASF124')).toThrow()
		expect(() => normalizePermalink('/hello/hello-worldasf\tASFASF124')).toThrow()
		expect(() => normalizePermalink('/news/../hello')).toThrow()
		expect(() => normalizePermalink('/%2e%2e/hello')).toThrow()
		expect(() => normalizePermalink('/%252e%252e/hello')).toThrow()
		for (const value of ['/foo%ZZ', '/foo%', '/foo%2', '/foo%2g', '/foo%252'])
			expect(() => normalizePermalink(value)).toThrow()
		expect(normalizePermalink('/foo%2Fbar')).toBe('/foo%2Fbar')
	})

	it('enforces or preserves manual trailing slash policy', () => {
		expect(applyTrailingSlash('/news/article', true)).toBe('/news/article/')
		expect(applyTrailingSlash('/', true)).toBe('/')
		expect(
			normalizeManualPermalink('/news/article/', {
				trailingSlash: false,
				enforceTrailingSlash: true,
			}),
		).toBe('/news/article')
	})

	it('normalizes HTTP(S) hosts only', () => {
		expect(normalizeHost('https://example.com/')).toEqual({
			host: 'https://example.com',
			error: null,
		})
		expect(normalizeHost('https://example.com/base').error).toBeTruthy()
		expect(normalizeHost('example.com').error).toBeTruthy()
	})

	it('rejects every unsafe path class', () => {
		for (const value of [
			'https://example.com/path',
			'//example.com/path',
			'/path?query',
			'/path#fragment',
			'/path\\child',
			'/path/./child',
			'/path/../child',
			'/path\nchild',
			'/path child',
		])
			expect(() => normalizePermalink(value)).toThrow()
	})

	it('keeps generated and manual trailing slash behavior distinct', () => {
		expect(
			normalizeManualPermalink('/news/item/', {
				trailingSlash: true,
				enforceTrailingSlash: false,
			}),
		).toBe('/news/item/')
		expect(
			normalizeManualPermalink('/news/item', {
				trailingSlash: true,
				enforceTrailingSlash: false,
			}),
		).toBe('/news/item')
		expect(
			normalizeManualPermalink('/', { trailingSlash: false, enforceTrailingSlash: true }),
		).toBe('/')
	})
})
