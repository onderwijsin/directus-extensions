import { describe, expect, it } from 'vitest'

import { isSameOriginRequest } from '../src/coolify-deployments-endpoint/same-origin'

const request = (headers: Record<string, string>, protocol = 'https') => ({
	get: (header: string) => headers[header],
	protocol,
})

describe('isSameOriginRequest', () => {
	it('allows requests without browser origin metadata', () => {
		expect(isSameOriginRequest(request({}))).toBe(true)
	})

	it('accepts a matching origin', () => {
		expect(
			isSameOriginRequest(
				request({ origin: 'https://studio.example.test', host: 'studio.example.test' }),
			),
		).toBe(true)
	})

	it('accepts a matching referer', () => {
		expect(
			isSameOriginRequest(
				request({
					referer: 'https://studio.example.test/admin',
					host: 'studio.example.test',
				}),
			),
		).toBe(true)
	})

	it('rejects cross-origin and opaque browser requests', () => {
		expect(
			isSameOriginRequest(
				request({ origin: 'https://attacker.example.test', host: 'studio.example.test' }),
			),
		).toBe(false)
		expect(isSameOriginRequest(request({ origin: 'null', host: 'studio.example.test' }))).toBe(
			false,
		)
	})

	it('uses origin metadata resolved by Express behind a trusted proxy', () => {
		expect(
			isSameOriginRequest(
				request(
					{
						origin: 'https://studio.example.test',
						host: 'studio.example.test',
					},
					'https',
				),
			),
		).toBe(true)
	})

	it('uses the configured public URL when Express sees an internal proxy origin', () => {
		expect(
			isSameOriginRequest(
				request(
					{
						origin: 'https://studio.example.test',
						host: 'directus:8055',
					},
					'http',
				),
				'https://studio.example.test/',
			),
		).toBe(true)
	})

	it('does not trust client-supplied forwarded origin metadata', () => {
		expect(
			isSameOriginRequest(
				request({
					origin: 'https://attacker.example.test',
					host: 'studio.example.test',
					'x-forwarded-host': 'attacker.example.test',
					'x-forwarded-proto': 'https',
				}),
			),
		).toBe(false)
	})
})
