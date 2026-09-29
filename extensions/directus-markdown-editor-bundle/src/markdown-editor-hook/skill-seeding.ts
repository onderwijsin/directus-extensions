import type { SchemaOverview, HookExtensionContext } from '@directus/types'

import { createHash } from 'node:crypto'

import { attempt, isNumber, isString } from '@onderwijsin/directus-extension-utils'
import { z } from 'zod'

import {
	EDITOR_SKILLS_COLLECTION,
	editorSkillSeedSchema,
	type NormalizedEditorSkillSeed,
} from '../shared/editor-skill'

const INCOMING_VERSION_KEY = 'incoming'

/** Options for Markdown-owned skill reconciliation. */
export interface SeedEditorSkillsOptions {
	abortOnError?: boolean
	strategy?: 'override' | 'versioning'
}

/**
 * Select the seed-owned values used for comparison and persistence.
 * @param skill Normalized editor skill seed.
 * @returns Canonical seed-owned fields.
 */
function canonicalSkill(skill: NormalizedEditorSkillSeed): Record<string, unknown> {
	return {
		archived: skill.archived,
		description: skill.description,
		icon: skill.icon,
		id: skill.id,
		name: skill.name,
		prompt: skill.prompt,
		scopes: skill.scopes,
		sort: skill.sort,
	}
}

/**
 * Create a stable content fingerprint for a normalized skill seed.
 * @param skill Normalized editor skill seed.
 * @returns SHA-256 content fingerprint.
 */
function fingerprint(skill: NormalizedEditorSkillSeed): string {
	return createHash('sha256')
		.update(JSON.stringify(canonicalSkill(skill)))
		.digest('hex')
}

/**
 * Build system-accountability options for item and version services.
 * @param context Directus hook context.
 * @param schema Current Directus schema overview.
 * @returns Service constructor options.
 */
function serviceOptions(context: HookExtensionContext, schema: SchemaOverview) {
	return { accountability: null, knex: context.database, schema }
}

/**
 * Reconcile Markdown-owned editor skills using Studio Docs-compatible version semantics.
 * @param skills Fixed skill definitions bundled with the extension.
 * @param context Directus hook context.
 * @param options Reconciliation strategy and failure behavior.
 * @returns Nothing after all supplied seeds are reconciled.
 */
export async function seedEditorSkills(
	skills: unknown,
	context: HookExtensionContext,
	options: SeedEditorSkillsOptions = {},
): Promise<void> {
	const seeds = z.array(editorSkillSeedSchema).parse(skills)
	if (seeds.length === 0) return

	const result = await attempt(async () => {
		const schema = await context.getSchema()
		const collectionsService = new context.services.CollectionsService({
			...serviceOptions(context, schema),
		})
		const collection = await attempt(() => collectionsService.readOne(EDITOR_SKILLS_COLLECTION))
		if (collection.error) {
			context.logger.info({
				msg: 'Markdown Editor skill seeding skipped; collection is unavailable',
				collection: EDITOR_SKILLS_COLLECTION,
			})
			return
		}

		const itemsService = new context.services.ItemsService(EDITOR_SKILLS_COLLECTION, {
			...serviceOptions(context, schema),
		})
		for (const seed of seeds) {
			const existingResult = await attempt(() => itemsService.readOne(seed.id))
			if (existingResult.error || existingResult.data === null) {
				await itemsService.createOne(seed)
				continue
			}

			const existing = editorSkillSeedSchema.parse(existingResult.data)
			if (fingerprint(existing) === fingerprint(seed)) continue
			if ((options.strategy ?? 'versioning') === 'override') {
				await itemsService.updateOne(seed.id, seed)
				continue
			}

			const versionsService = new context.services.VersionsService({
				...serviceOptions(context, schema),
			})
			const versions = await versionsService.readByQuery({
				filter: {
					collection: { _eq: EDITOR_SKILLS_COLLECTION },
					item: { _eq: seed.id },
					key: { _eq: INCOMING_VERSION_KEY },
				},
				limit: 1,
			})
			const incomingId = versions[0]?.id
			if (isString(incomingId) || isNumber(incomingId)) {
				await versionsService.save(incomingId, seed)
			} else {
				const versionId = await versionsService.createOne({
					collection: EDITOR_SKILLS_COLLECTION,
					item: seed.id,
					key: INCOMING_VERSION_KEY,
					name: 'Incoming',
				})
				await versionsService.save(versionId, seed)
			}
		}
	})

	if (result.error === null) return
	context.logger.error({ msg: 'Markdown Editor skill seeding failed', cause: result.error })
	if (options.abortOnError ?? true) {
		throw result.error instanceof Error
			? result.error
			: new Error('Markdown Editor skill seeding failed', { cause: result.error })
	}
}
