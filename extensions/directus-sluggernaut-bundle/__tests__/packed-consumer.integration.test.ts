import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename } from 'node:path'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

describe('Sluggernaut packed consumer artifact', () => {
	it('contains only the published bundle surface and both runtime entrypoints', () => {
		const destination = mkdtempSync(join(tmpdir(), 'sluggernaut-pack-'))
		try {
			const output = execFileSync(
				'corepack',
				['pnpm', 'pack', '--pack-destination', destination],
				{
					cwd: new URL('..', import.meta.url),
					encoding: 'utf8',
				},
			)
			const archiveName = output.split('\n').find((line) => line.endsWith('.tgz'))
			expect(archiveName).toBeTruthy()
			const archive = archiveName?.startsWith('/')
				? archiveName
				: join(destination, archiveName ?? '')
			const entries = execFileSync('tar', ['-tzf', archive], { encoding: 'utf8' })
				.split('\n')
				.filter(Boolean)
			expect(entries.some((entry) => entry === 'package/dist/app.js')).toBe(true)
			expect(entries.some((entry) => entry === 'package/dist/api.js')).toBe(true)
			expect(entries.some((entry) => entry.startsWith('package/schema/'))).toBe(true)
			expect(entries.some((entry) => entry.startsWith('package/src/'))).toBe(false)
			expect(entries.some((entry) => entry.startsWith('package/__tests__/'))).toBe(false)
			const manifest = JSON.parse(
				execFileSync('tar', ['-xOf', archive, 'package/package.json'], {
					encoding: 'utf8',
				}),
			) as { name: string; 'directus:extension': { entries: { name: string }[] } }
			expect(manifest.name).toBe('@onderwijsin/directus-sluggernaut-bundle')
			expect(manifest['directus:extension'].entries.map(({ name }) => name)).toEqual([
				'sluggernaut-slug',
				'sluggernaut-permalink',
				'sluggernaut-link',
				'sluggernaut-hook',
				'sluggernaut-recalculate',
			])
			// Keep the test's filesystem assertion explicit so an accidentally empty pack cannot pass.
			expect(readdirSync(destination)).toContain(basename(archive))
			expect(readFileSync(archive).byteLength).toBeGreaterThan(0)
		} finally {
			rmSync(destination, { recursive: true, force: true })
		}
	})
})
