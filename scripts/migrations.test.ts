import { readdir } from 'node:fs/promises'

import { expect, it } from 'vitest'

it('validates custom migration filenames and unique identifiers across phases', async () => {
	const phases = await Promise.all(
		['bootstrap', 'post-schema'].map((phase) =>
			readdir(new URL(`../migrations/${phase}/`, import.meta.url)),
		),
	)
	const identifiers = phases.flatMap((files) =>
		files
			.filter((file) => /\.(c|m)?js$/u.test(file))
			.map((file) => {
				const basename = file.replace(/\.(c|m)?js$/u, '')
				const separator = basename.indexOf('-')

				if (
					separator < 1 ||
					!basename.slice(0, separator).trim() ||
					!basename.slice(separator + 1).trim()
				) {
					throw new Error(
						`Invalid migration filename "${file}": expected <identifier>-<description> with non-empty identifier and description`,
					)
				}

				return basename.slice(0, separator)
			}),
	)

	expect(identifiers.length).toBeGreaterThan(0)
	expect(new Set(identifiers).size).toBe(identifiers.length)
})
