/// <reference types="node" />

import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import {
	validateDocumentation,
	validateDocumentStructure,
	validateExtensionDocumentation,
} from './validate-docs.mjs'

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
			'extensions/example/README.md: level-one heading must contain @example/directus-extension-example',
			'@example/directus-extension-example: missing or incorrect root README table entry',
			'@example/directus-extension-example: README is missing /@example\\/directus-extension-example/u',
			'@example/directus-extension-example: README is missing /install/iu',
			'@example/directus-extension-example: skill is missing /directus/iu',
			'skills/example/SKILL.md: must start with YAML front matter',
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

	it('passes when a public workspace package has inventory documentation', () => {
		const repository = createRepository(
			'# Repository\n\n| Package | Description |\n| --- | --- |\n| [`@example/directus-extension-example`](extensions/example/README.md) | Example |\n| [`@example/directus-package`](packages/example/README.md) | Package |\n',
			'# `@example/directus-extension-example`\n\nInstall this trusted Directus extension.\n',
			'---\nname: example\ndescription: Example skill\n---\n\n# Example\n\nInstall and use this Directus extension.\n',
		)
		mkdirSync(join(repository, 'packages', 'example'), { recursive: true })
		writeFileSync(
			join(repository, 'packages', 'example', 'package.json'),
			JSON.stringify({ name: '@example/directus-package' }),
		)
		writeFileSync(
			join(repository, 'packages', 'example', 'README.md'),
			'# `@example/directus-package`\n\nInstall and use this package.\n',
		)

		expect(validateDocumentation(repository)).toEqual([])
	})

	it('reports a broken root README package link', () => {
		const repository = createRepository(
			'| Package | Description |\n| --- | --- |\n| [`@example/missing`](packages/missing/README.md) | Missing |\n',
			'# `@example/directus-extension-example`\n\nInstall this trusted Directus extension.\n',
			'---\nname: example\ndescription: Example skill\n---\n\n# Example\n\nInstall and use this Directus extension.\n',
		)

		expect(validateDocumentation(repository)).toContain(
			'@example/missing: root README link target does not exist: packages/missing/README.md',
		)
	})

	it('reports conflicting root README entries for one package', () => {
		const repository = createRepository(
			'| Package | Description |\n| --- | --- |\n| [`@example/directus-extension-example`](extensions/example/README.md) | Example |\n| [`@example/directus-extension-example`](packages/example/README.md) | Conflicting |\n',
			'# `@example/directus-extension-example`\n\nInstall this trusted Directus extension.\n',
			'---\nname: example\ndescription: Example skill\n---\n\n# Example\n\nInstall and use this Directus extension.\n',
		)

		expect(validateDocumentation(repository)).toContain(
			'README.md: conflicting package table entry @example/directus-extension-example',
		)
	})

	it('reports a missing consumer skill', () => {
		const repository = createRepository(
			'| Package | Description |\n| --- | --- |\n| [`@example/directus-extension-example`](extensions/example/README.md) | Example |\n',
			'# `@example/directus-extension-example`\n\nInstall this trusted Directus extension.\n',
			'---\nname: example\ndescription: Example skill\n---\n\n# Example\n\nInstall and use this Directus extension.\n',
		)
		rmSync(join(repository, 'skills', 'example', 'SKILL.md'))

		expect(validateDocumentation(repository)).toContain(
			'@example/directus-extension-example: missing skills/example/SKILL.md',
		)
	})

	it('does not require consumer skills for private extensions', () => {
		const repository = mkdtempSync(join(tmpdir(), 'directus-extensions-docs-'))
		temporaryDirectories.push(repository)
		mkdirSync(join(repository, 'extensions', 'private-example'), { recursive: true })
		writeFileSync(join(repository, 'README.md'), '# Repository\n')
		writeFileSync(
			join(repository, 'extensions', 'private-example', 'package.json'),
			JSON.stringify({ name: '@example/private-example', private: true }),
		)
		writeFileSync(
			join(repository, 'extensions', 'private-example', 'README.md'),
			'# `@example/private-example`\n\nPrivate package documentation.\n',
		)

		expect(validateDocumentation(repository)).toEqual([])
	})

	it('reports structural failures in maintainer documentation', () => {
		const repository = createRepository(
			'# Repository\n',
			'# `@example/directus-extension-example`\n\nInstall this trusted Directus extension.\n',
			'---\nname: example\ndescription: Example skill\n---\n\n# Example\n\nInstall and use this Directus extension.\n',
		)
		mkdirSync(join(repository, 'docs'), { recursive: true })
		writeFileSync(join(repository, 'docs', 'broken.md'), '# Broken\n\n### Skipped\n')

		expect(validateDocumentation(repository)).toContain(
			'docs/broken.md:3: heading level skips from H1 to H3',
		)
	})

	it('ignores headings inside fenced examples and validates skill metadata', () => {
		expect(
			validateDocumentStructure(
				'skills/example/SKILL.md',
				'---\nname: example\ndescription: Example skill\n---\n\n# Example\n\n## Usage\n\n```text\n# Not a heading\n```\n',
				{ skillName: 'example' },
			),
		).toEqual([])
	})

	it('reports malformed heading structure and front matter metadata', () => {
		const failures = validateDocumentStructure(
			'skills/example/SKILL.md',
			'---\nname: wrong\n---\n\n# Example\n\n### Skipped\n\n### Skipped\n',
			{ skillName: 'example' },
		)

		expect(failures).toEqual([
			'skills/example/SKILL.md:7: heading level skips from H1 to H3',
			'skills/example/SKILL.md:9: duplicate heading Skipped',
			'skills/example/SKILL.md: front matter is missing description',
			'skills/example/SKILL.md: front matter name must be example',
		])
	})

	it('reports unclosed, invalid, and duplicate front matter', () => {
		expect(
			validateDocumentStructure('skills/example/SKILL.md', '---\nname: example\n', {
				skillName: 'example',
			}),
		).toContain('skills/example/SKILL.md: has unclosed YAML front matter')
		expect(
			validateDocumentStructure(
				'skills/example/SKILL.md',
				'---\nname: example\nname: duplicate\n---\n# Example\n',
				{
					skillName: 'example',
				},
			),
		).toContain('skills/example/SKILL.md: duplicates front matter field: name')
		expect(
			validateDocumentStructure(
				'skills/example/SKILL.md',
				'---\nnot valid\n---\n# Example\n',
				{
					skillName: 'example',
				},
			),
		).toContain('skills/example/SKILL.md: has invalid front matter line: not valid')
	})

	it('does not require trusted-runtime wording for sandboxed extensions', () => {
		const failures = validateExtensionDocumentation(
			'@example/directus-extension-example',
			{ 'directus:extension': { type: 'hook', sandbox: { enabled: true } } },
			'# `@example/directus-extension-example`\n\nInstall this Directus hook.\n',
			'---\nname: example\ndescription: Example skill\n---\n\n# Example\n\nInstall and use this Directus hook.\n',
		)

		expect(failures).not.toContain(
			'@example/directus-extension-example: non-sandboxed extensions must document the trusted runtime boundary',
		)
	})
})
