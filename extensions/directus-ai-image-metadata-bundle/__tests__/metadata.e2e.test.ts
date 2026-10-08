import { createDirectusE2EClient } from '@workspace/test-utils'
import {
	createFlow,
	createOperation,
	customEndpoint,
	deleteFile,
	deleteFlow,
	deleteOperation,
	readFile,
	updateFile,
	updateFlow,
	uploadFiles,
	createFolder,
	deleteFolder,
} from '@workspace/test-utils/commands'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'

const environment = z
	.object({
		DIRECTUS_E2E_URL: z.url(),
		DIRECTUS_E2E_TOKEN: z.string(),
		DIRECTUS_E2E_COMPOSE_FILES: z
			.string()
			.transform((value) => z.array(z.string()).parse(JSON.parse(value))),
		DIRECTUS_E2E_COMPOSE_PROJECT: z.string(),
	})
	.parse(process.env)

const client = createDirectusE2EClient({
	baseUrl: environment.DIRECTUS_E2E_URL,
	token: environment.DIRECTUS_E2E_TOKEN,
	composeFiles: environment.DIRECTUS_E2E_COMPOSE_FILES,
	composeProject: environment.DIRECTUS_E2E_COMPOSE_PROJECT,
})
const resultSchema = z.object({
	results: z.array(
		z.object({
			id: z.uuid(),
			status: z.enum(['updated', 'skipped', 'failed']),
			durationMs: z.number().nonnegative(),
			error: z
				.object({ stage: z.string(), code: z.string(), retryable: z.boolean() })
				.optional(),
			fields: z.array(z.string()),
		}),
	),
	summary: z
		.object({
			runId: z.uuid(),
			filesFound: z.number(),
			filesAttempted: z.number(),
			filesUpdated: z.number(),
			filesSkipped: z.number(),
			filesFailed: z.number(),
			hasFailures: z.boolean(),
			complete: z.boolean(),
			outcome: z.string(),
		})
		.optional(),
	scanned: z.number().optional(),
	nextOffset: z.number().nullable().optional(),
	complete: z.boolean().optional(),
})

/**
 * Executes an installed operation through a disposable synchronous webhook Flow.
 * @param type - Operation ID.
 * @param options - Persisted Flow options.
 * @returns Validated data-chain output.
 */
async function runOperation(type: string, options: Record<string, unknown>) {
	const flow = await client.request(
		createFlow({
			name: 'Image metadata E2E',
			status: 'active',
			trigger: 'webhook',
			accountability: '$trigger',
			options: { method: 'POST', async: false, return: '$last' },
		}),
	)
	let operationId: string | undefined
	try {
		const operation = await client.request<{ id: string }>(
			createOperation({
				flow: flow.id,
				key: 'metadata',
				name: 'Image metadata',
				type,
				position_x: 1,
				position_y: 1,
				options,
			}),
		)
		operationId = operation.id
		await client.request(updateFlow(flow.id, { operation: operation.id }))
		return resultSchema.parse(
			await client.request(
				customEndpoint({ path: `/flows/trigger/${flow.id}`, method: 'POST', body: '{}' }),
			),
		)
	} finally {
		if (operationId) await client.request(deleteOperation(operationId))
		await client.request(deleteFlow(flow.id))
	}
}

/**
 * Uploads a private PNG asset for provider byte-input verification.
 * @param folder - Test folder ID.
 * @returns Uploaded file ID.
 */
async function uploadImage(folder: string) {
	const data = new FormData()
	data.append('folder', folder)
	data.append(
		'file',
		new Blob(
			[
				Buffer.from(
					'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a4x8AAAAASUVORK5CYII=',
					'base64',
				),
			],
			{ type: 'image/png' },
		),
		'original.png',
	)
	const file = await client.request(uploadFiles(data))
	return file.id
}

describe('image metadata installed Flow operations', () => {
	it('reads private bytes, writes metadata, preserves existing values, and renames on explicit overwrite', async () => {
		const folder = await client.request(createFolder({ name: 'Image metadata test' }))
		let id: string | undefined
		try {
			id = await uploadImage(folder.id)
			expect(
				(
					await runOperation('ai-image-metadata', {
						files: id,
						generateAltText: false,
						overwriteAltText: true,
					})
				).results,
			).toEqual([{ id, status: 'skipped', fields: [], durationMs: expect.any(Number) }])
			const independentTags = await runOperation('ai-image-metadata', {
				files: id,
				generateAltText: false,
				generateTags: true,
			})
			expect(independentTags.results[0]?.fields).toEqual(['tags'])
			expect((await client.request(readFile(id))).description).toBeNull()
			await client.request(updateFile(id, { tags: null }))
			expect(
				(
					await runOperation('ai-image-metadata', {
						files: id,
						excludeFolders: [{ key: folder.id, collection: 'directus_folders' }],
					})
				).results,
			).toEqual([{ id, status: 'skipped', fields: [], durationMs: expect.any(Number) }])
			expect(
				(await runOperation('ai-image-metadata', { files: id, mimeTypes: 'image/jpeg' }))
					.results,
			).toEqual([{ id, status: 'skipped', fields: [], durationMs: expect.any(Number) }])
			const result = await runOperation('ai-image-metadata', {
				files: id,
				generateTags: true,
				generateFilename: true,
			})
			expect(result.results).toEqual([
				{
					id,
					status: 'updated',
					fields: ['description', 'tags'],
					durationMs: expect.any(Number),
				},
			])
			expect(await client.request(readFile(id))).toMatchObject({
				description: 'Een kleine testafbeelding.',
				tags: ['test', 'afbeelding'],
				filename_download: 'original.png',
			})
			await client.request(
				updateFile(id, { description: 'Human reviewed description', tags: ['manual'] }),
			)
			expect(
				(await runOperation('ai-image-metadata', { files: id, generateTags: true }))
					.results,
			).toEqual([{ id, status: 'skipped', fields: [], durationMs: expect.any(Number) }])
			await runOperation('ai-image-metadata', {
				files: id,
				generateTags: true,
				generateFilename: true,
				overwriteFilename: true,
			})
			expect(await client.request(readFile(id))).toMatchObject({
				description: 'Human reviewed description',
				tags: ['manual'],
				filename_download: 'kleine-testafbeelding.png',
			})
			const tagsOnly = await runOperation('ai-image-metadata', {
				files: id,
				generateTags: true,
				overwriteTags: true,
			})
			expect(tagsOnly.results).toEqual([
				{ id, status: 'updated', fields: ['tags'], durationMs: expect.any(Number) },
			])
			expect(await client.request(readFile(id))).toMatchObject({
				description: 'Human reviewed description',
				tags: ['test', 'afbeelding'],
				filename_download: 'kleine-testafbeelding.png',
			})
			const altOnly = await runOperation('ai-image-metadata', {
				language: 'English',
				files: id,
				overwriteAltText: true,
			})
			expect(altOnly.results).toEqual([
				{ id, status: 'updated', fields: ['description'], durationMs: expect.any(Number) },
			])
			expect(await client.request(readFile(id))).toMatchObject({
				description: 'A small test image.',
				tags: ['test', 'afbeelding'],
				filename_download: 'kleine-testafbeelding.png',
			})
		} finally {
			if (id) await client.request(deleteFile(id))
			await client.request(deleteFolder(folder.id))
		}
	})

	it('isolates an inaccessible file between successes and preserves single-file rejection', async () => {
		const folder = await client.request(createFolder({ name: 'Image diagnostics test' }))
		const ids: string[] = []
		const missing = 'ffffffff-ffff-4fff-8fff-ffffffffffff'
		try {
			ids.push(await uploadImage(folder.id), await uploadImage(folder.id))
			const output = await runOperation('ai-image-metadata', {
				files: [ids[0], missing, ids[1]],
			})
			expect(output.results.map((result) => result.status)).toEqual([
				'updated',
				'failed',
				'updated',
			])
			expect(output.results[1]).toMatchObject({
				id: missing,
				error: { stage: 'read_file', retryable: false },
			})
			for (const id of ids)
				expect(await client.request(readFile(id))).toMatchObject({
					description: 'Een kleine testafbeelding.',
				})
			await expect(runOperation('ai-image-metadata', { files: missing })).rejects.toThrow()
			const regenerated = await runOperation('ai-image-metadata-regenerate', {
				includeFolders: [{ key: folder.id, collection: 'directus_folders' }],
				missingOnly: false,
				overwriteAltText: true,
			})
			expect(regenerated.summary).toMatchObject({
				filesAttempted: 2,
				filesUpdated: 2,
				filesFailed: 0,
				outcome: 'success',
				complete: true,
			})
			await expect(
				client.waitForLog(
					new RegExp(
						`Image metadata regeneration completed .*"runId":"${regenerated.summary?.runId}"`,
						'u',
					),
				),
			).resolves.toBeDefined()
		} finally {
			for (const id of ids) await client.request(deleteFile(id))
			await client.request(deleteFolder(folder.id))
		}
	})

	it('resumes bounded backfills without skipping records after metadata updates', async () => {
		const folder = await client.request(createFolder({ name: 'Backfill metadata test' }))
		const ids: string[] = []
		try {
			ids.push(await uploadImage(folder.id), await uploadImage(folder.id))
			let offset = 0
			const updated = new Set<string>()
			let complete = false
			for (let iteration = 0; iteration < 20 && !complete; iteration += 1) {
				const page = await runOperation('ai-image-metadata-regenerate', {
					includeFolders: [{ key: folder.id, collection: 'directus_folders' }],
					maxFiles: 1,
					offset,
				})
				for (const result of page.results)
					if (result.status === 'updated') updated.add(result.id)
				offset = page.nextOffset ?? 0
				complete = page.complete === true
			}
			expect(complete).toBe(true)
			expect([...updated].sort()).toEqual([...ids].sort())
			const repeated = await runOperation('ai-image-metadata-regenerate', {
				includeFolders: [{ key: folder.id, collection: 'directus_folders' }],
				overwriteAltText: true,
			})
			expect(repeated.results.every((result) => result.status === 'skipped')).toBe(true)
			const regenerated = await runOperation('ai-image-metadata-regenerate', {
				includeFolders: [{ key: folder.id, collection: 'directus_folders' }],
				missingOnly: false,
				overwriteAltText: true,
			})
			expect(regenerated.results).toHaveLength(2)
			expect(
				regenerated.results.every(
					(result) =>
						result.status === 'updated' &&
						result.fields.length === 1 &&
						result.fields[0] === 'description',
				),
			).toBe(true)
		} finally {
			for (const id of ids) await client.request(deleteFile(id))
			await client.request(deleteFolder(folder.id))
		}
	})
})
