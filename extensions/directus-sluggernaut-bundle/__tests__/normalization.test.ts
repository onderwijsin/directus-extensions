import { describe, expect, it } from 'vitest'

import {
	applyTrailingSlash,
	combineSourceValues,
	deriveSlug,
	isWithinPrefix,
	joinPrefixAndSlug,
	normalizeHost,
	normalizeManualPermalink,
	normalizePermalink,
	normalizePrefix,
	resolveFinalValue,
} from '../src/shared/values/normalization'

describe('Sluggernaut normalization', () => {
	it('derives a slug from multiple non-empty source values', () => {
		expect(deriveSlug([' Remí ', 'Huigen'], 'en', true)).toBe('remi-huigen')
	})

	it('uses locale-aware lowercasing without relying on truthiness', () => {
		expect(deriveSlug(['İstanbul'], 'tr', true)).toBe('istanbul')
		expect(combineSourceValues([null, undefined, '', '  ', 'kept'])).toBe('kept')
	})

	it('resolves an explicitly present falsy payload value', () => {
		expect(resolveFinalValue({ title: null }, { title: 'Old title' }, 'title')).toBeNull()
		expect(resolveFinalValue({}, { title: 'Old title' }, 'title')).toBe('Old title')
	})

	it('validates absolute permalink paths', () => {
		expect(normalizePermalink('/news//hello')).toBe('/news/hello')
		expect(normalizePermalink('/')).toBe('/')
		expect(() => normalizePermalink('news/hello')).toThrow()
		expect(() => normalizePermalink('https://example.com/news')).toThrow()
		expect(() => normalizePermalink('/news?draft=true')).toThrow()
		expect(() => normalizePermalink('/news/../hello')).toThrow()
	})

	it('normalizes prefixes and joins them with slugs', () => {
		expect(normalizePrefix('news/')).toBe('/news')
		expect(joinPrefixAndSlug('/news/', 'Hello World')).toBe('/news/hello-world')
		expect(joinPrefixAndSlug('/', 'Hello World')).toBe('/hello-world')
	})

	it('matches prefix boundaries rather than string prefixes', () => {
		expect(isWithinPrefix('/news/article', '/news')).toBe(true)
		expect(isWithinPrefix('/newspaper/article', '/news')).toBe(false)
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

	it('validates manual prefix membership', () => {
		expect(() =>
			normalizeManualPermalink('/landing', {
				prefix: '/news',
				validatePrefix: true,
			}),
		).toThrow()
	})

	it('normalizes HTTP(S) hosts only', () => {
		expect(normalizeHost('https://example.com/')).toEqual({
			host: 'https://example.com',
			error: null,
		})
		expect(normalizeHost('https://example.com/base').error).toBeTruthy()
		expect(normalizeHost('example.com').error).toBeTruthy()
	})
})
