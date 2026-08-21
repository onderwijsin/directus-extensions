import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { INTERFACE_IDS } from '../src/shared/configuration/constants'
import { envSchema } from '../src/sluggernaut-hook/configuration/env.schema'
import operation from '../src/sluggernaut-recalculate'

describe('Sluggernaut bundle scaffold', () => {
	it('declares the complete five-entry bundle contract and publishable runtime boundaries', () => {
		const manifest = JSON.parse(
			readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
		) as {
			engines: { node: string }
			files: string[]
			dependencies: Record<string, string>
			devDependencies: Record<string, string>
			'directus:extension': {
				host: string
				path: Record<string, string>
				entries: Record<string, unknown>[]
			}
		}
		const extension = manifest['directus:extension']
		expect(extension.host).toBe('>=12.2.0 <13')
		expect(extension.path).toEqual({ app: 'dist/app.js', api: 'dist/api.js' })
		expect(extension.entries.map(({ name, type }) => ({ name, type }))).toEqual([
			{ name: 'sluggernaut-slug', type: 'interface' },
			{ name: 'sluggernaut-permalink', type: 'interface' },
			{ name: 'sluggernaut-link', type: 'display' },
			{ name: 'sluggernaut-hook', type: 'hook' },
			{ name: 'sluggernaut-recalculate', type: 'operation' },
		])
		expect(manifest.files).toEqual(
			expect.arrayContaining(['dist', 'schema', 'README.md', 'CHANGELOG.md']),
		)
		expect(manifest.engines.node).toBe('>=24.10.0')
		expect(manifest.dependencies['@workspace/test-utils']).toBeUndefined()
		expect(manifest.devDependencies['@workspace/test-utils']).toBe('workspace:*')
	})
	it('uses the V2 interface identifiers', () => {
		expect(INTERFACE_IDS).toEqual({
			slug: 'sluggernaut-slug',
			permalink: 'sluggernaut-permalink',
		})
	})

	it('provides the documented environment defaults', () => {
		expect(envSchema.parse({})).toMatchObject({
			SLUGGERNAUT_ENABLED: true,
			SLUGGERNAUT_REDIRECTS_ENABLED: false,
			SLUGGERNAUT_REDIRECTS_COLLECTION: 'redirects',
			SLUGGERNAUT_FIELDS_CACHE_TTL_MS: 60_000,
			SLUGGERNAUT_SCHEMA_CHANGES_ENABLED: false,
			SLUGGERNAUT_SCHEMA_ABORT_ON_ERROR: true,
			SLUGGERNAUT_MANAGE_REDIRECTS_POLICY_ENABLED: false,
			SLUGGERNAUT_READ_ACTIVE_REDIRECTS_POLICY_ENABLED: false,
			DIRECTUS_EXTENSIONS_SCHEMA_CHANGES_ENABLED: true,
		})
	})

	it('uses collection-aware system interfaces for recalculation options', () => {
		expect(operation.options).toEqual(
			expect.arrayContaining([
				{
					field: 'collection',
					name: '$t:collection',
					type: 'string',
					meta: {
						interface: 'system-collection',
						options: { includeSystem: false },
					},
				},
				{
					field: 'fields',
					name: 'Fields',
					type: 'json',
					meta: {
						interface: 'system-fields',
						width: 'full',
						options: { collectionField: 'collection' },
					},
				},
			]),
		)
	})
})
