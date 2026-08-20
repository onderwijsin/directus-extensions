import { describe, expect, it } from 'vitest'

import { displayHost, displayHref, displayPath } from '../src/sluggernaut-link/link'

describe('Sluggernaut link display helpers', () => {
	it('normalizes slugs and preserves permalink paths', () => {
		expect(displayPath('hello-world')).toBe('/hello-world')
		expect(displayPath('/news/hello-world')).toBe('/news/hello-world')
		expect(displayPath('  /news/hello-world  ')).toBe('/news/hello-world')
		expect(displayPath(null)).toBeNull()
	})

	it('accepts only HTTP(S) hosts', () => {
		expect(displayHost('https://example.com/')).toBe('https://example.com')
		expect(displayHost('http://localhost:8055')).toBe('http://localhost:8055')
		expect(displayHost('javascript:alert(1)')).toBeNull()
		expect(displayHost('not-a-url')).toBeNull()
	})

	it('builds an absolute href only with a valid host', () => {
		expect(displayHref('/news/hello', 'https://example.com/')).toBe(
			'https://example.com/news/hello',
		)
		expect(displayHref('hello', undefined)).toBeNull()
	})
})
