import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

const template = readFileSync(new URL('../templates/magic-link.liquid', import.meta.url), 'utf8')

describe('magic-link email template', () => {
	it('renders the link, human-readable expiry, and neutral request metadata', () => {
		expect(template).toContain('href="{{url}}"')
		expect(template).toContain('{{ expires_at | date:')
		expect(template).toContain('{{ issued_at | date:')
		expect(template).toContain('{{ ip }}')
		expect(template).toContain('{{ user_agent }}')
		expect(template).toContain("If you don't recognize this sign-in attempt")
	})
})
