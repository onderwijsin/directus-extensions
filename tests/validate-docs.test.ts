/// <reference types="node" />

import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { validateDocumentation, validateExtensionDocumentation } from '../scripts/validate-docs.mjs'

const temporaryDirectories: string[] = []

function createRepository(readme: string, packageReadme: string, skill: string): string {
	const repository = mkdtempSync(join(tmpdir(), 'directus-extensions-docs-'))
	temporaryDirectories.push(repository)
	mkdirSync(join(repository, 'extensions', 'example'), { recursive: true })
	mkdirSync(join(repository, 'skills', 'example'), { recursive: true })
	writeFileSync(join(repository, 'README.md'), readme)
	writeFileSync(join(repository, 'extensions', 'example', 'README.md'), packageReadme)
	writeFileSync(join(repository, 'skills', 'example', 'SKILL.md'), skill)
	writeFileSync(
		join(repository, 'extensions', 'example', 'package.json'),
		JSON.stringify({
			name: '@example/directus-extension-example',
			'directus:extension': { type: 'hook', sandbox: { enabled: false } },
		}),
	)
	return repository
}

afterEach(() => {
	for (const directory of temporaryDirectories.splice(0))
		rmSync(directory, { recursive: true, force: true })
})

describe('documentation validation', () => {
	it('passes the repository consumer documentation contract', () => {
		expect(validateDocumentation()).toEqual([])
	})

	it('detects missing root README entries and incomplete consumer documents', () => {
		const repository = createRepository(
			'# Repository\n',
			'# Example\n\nA Directus extension.\n',
			'# Example skill\n\nUse it.\n',
		)

		expect(validateDocumentation(repository)).toEqual([
			'@example/directus-extension-example: missing or incorrect root README table entry',
			'@example/directus-extension-example: README is missing /@example\\/directus-extension-example/u',
			'@example/directus-extension-example: README is missing /install/iu',
			'@example/directus-extension-example: skill is missing /directus/iu',
			'@example/directus-extension-example: non-sandboxed extensions must document the trusted runtime boundary',
		])
	})

	it('reports a missing package README without crashing', () => {
		const repository = mkdtempSync(join(tmpdir(), 'directus-extensions-docs-'))
		temporaryDirectories.push(repository)
		mkdirSync(join(repository, 'extensions', 'example'), { recursive: true })
		mkdirSync(join(repository, 'skills', 'example'), { recursive: true })
		writeFileSync(join(repository, 'README.md'), '# Repository\n')
		writeFileSync(join(repository, 'skills', 'example', 'SKILL.md'), '# Example\n')
		writeFileSync(
			join(repository, 'extensions', 'example', 'package.json'),
			JSON.stringify({ name: '@example/directus-extension-example' }),
		)

		expect(validateDocumentation(repository)).toContain(
			'@example/directus-extension-example: missing README',
		)
	})

	it('requires the trusted boundary for non-sandboxed API extensions', () => {
		const failures = validateExtensionDocumentation(
			'@example/directus-extension-example',
			{ 'directus:extension': { type: 'hook' } },
			'# Example\n\nInstall this Directus hook.\n',
			'# Example\n\nInstall and use this Directus hook.\n',
		)

		expect(failures).toContain(
			'@example/directus-extension-example: non-sandboxed extensions must document the trusted runtime boundary',
		)
	})
})
