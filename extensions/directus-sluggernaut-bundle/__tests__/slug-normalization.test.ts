import { describe, expect, it } from 'vitest'

import {
	applyTrailingSlash,
	deriveSlug,
	normalizeManualPermalink,
	normalizePermalink,
} from '../src/shared/values/normalization'

describe('Sluggernaut normalization', () => {
	it('joins configured source fields in order and ignores empty source values', () => {
		expect(deriveSlug(['  Summer  ', ' News '])).toBe('summer-news')
		expect(deriveSlug([null, undefined, '', '  ', 0, false])).toBeNull()
		expect(deriveSlug(['Summer', null, 'News'])).toBe('summer-news')
	})

	it('clears punctuation-only values and normalizes explicit values', () => {
		expect(deriveSlug(['---', '!!!'])).toBeNull()
		expect(deriveSlug([' Café / Déjà Vu! '])).toBe('cafe-deja-vu')
		expect(normalizeManualPermalink(' /landing// ', {})).toBe('/landing/')
	})

	it('supports locale families and punctuation, emoji, RTL, and mixed scripts', () => {
		for (const [locale, value] of [
			['nl', 'IJsselmeer'],
			['bg', 'Здравей свят'],
			['de', 'Äpfel Über'],
			['fr', 'École française'],
			['tr', 'İSTANBUL'],
			['vi', 'Tiếng Việt'],
		] as const) {
			const result = deriveSlug([value], locale)
			expect(result).toMatch(/^[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*$/u)
		}
		expect(deriveSlug(['Hello___world 😀 שלום العربية Русский!!!'])).toMatch(
			/^[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*$/u,
		)
	})

	it('normalizes trailing-slash rules', () => {
		expect(applyTrailingSlash('/a//b', true)).toBe('/a/b/')
		expect(
			normalizeManualPermalink('/nested/path/item', {
				trailingSlash: true,
				enforceTrailingSlash: true,
			}),
		).toBe('/nested/path/item/')
	})

	it('normalizes valid manual paths and rejects unsafe path classes', () => {
		expect(normalizeManualPermalink('/a/b/', { trailingSlash: true })).toBe('/a/b/')
		for (const value of [
			'https://example.com/path',
			'//example.com/path',
			'/path?query=1',
			'/path#fragment',
			'/path\\segment',
			'/path/./segment',
			'/path/../segment',
			'/%2e%2e/segment',
			'/path with whitespace',
			'/path\u0001segment',
		])
			expect(() => normalizePermalink(value)).toThrow()
	})

	it('treats markup, controls, and bidi markers as data', () => {
		expect(deriveSlug(['<strong>Hello</strong> {{name}} \u202eWorld'])).toBe(
			'strong-hello-strong-name-world',
		)
		expect(deriveSlug(['---'.repeat(100)])).toBeNull()
	})
})
