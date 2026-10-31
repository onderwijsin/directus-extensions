import { readdir } from 'node:fs/promises'

import { expect, it } from 'vitest'

it('keeps custom migration identifiers unique across execution phases', async () => {
	const phases = await Promise.all(
		['bootstrap', 'post-schema'].map((phase) =>
			readdir(new URL(`../migrations/${phase}/`, import.meta.url)),
		),
	)
	const identifiers = phases.flatMap((files) =>
		files
			.filter((file) => file.includes('-') && /\.(c|m)?js$/u.test(file))
			.map((file) => file.split('-')[0]),
	)

	expect(identifiers.length).toBeGreaterThan(0)
	expect(new Set(identifiers).size).toBe(identifiers.length)
})
