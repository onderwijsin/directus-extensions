import { readFile as readFixture } from 'node:fs/promises'

import { createDirectusE2EClient } from '@workspace/test-utils'
import {
	createFlow,
	createOperation,
	customEndpoint,
	deleteFile,
	deleteFlow,
	deleteOperation,
	readFile,
	readFiles,
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
			transformed: z.boolean(),
			originalMimeType: z.string().nullable(),
			transformationDurationMs: z.number().nonnegative(),
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
			assetsTransformed: z.number().int().nonnegative(),
			transformsByMimeType: z.record(z.string(), z.number().int().nonnegative()),
			hasFailures: z.boolean(),
			complete: z.boolean(),
			outcome: z.string(),
		})
		.optional(),
	scanned: z.number().optional(),
	nextCursor: z.uuid().nullable().optional(),
	remaining: z.boolean().optional(),
	remainingIds: z.array(z.uuid()).optional(),
	inspected: z.number().optional(),
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
		const output = await client.request(
			customEndpoint({ path: `/flows/trigger/${flow.id}`, method: 'POST', body: '{}' }),
		)
		const parsed = resultSchema.safeParse(output)
		if (!parsed.success) throw new Error(`Unexpected Flow output: ${JSON.stringify(output)}`)
		return parsed.data
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
			[new Uint8Array(await readFixture(new URL('./fixtures/red.png', import.meta.url)))],
			{ type: 'image/png' },
		),
		'original.png',
	)
	const file = await client.request(uploadFiles(data))
	return file.id
}

describe('image metadata installed Flow operations', () => {
	it('converts image candidates, ignores legacy MIME filters, isolates corruption and preserves cursor selection', async () => {
		const folder = await client.request(createFolder({ name: 'Image preparation E2E' }))
		const ids: string[] = []
		const imageIds: string[] = []
		const originals = new Map<string, { bytes: Uint8Array; mime: string }>()
		let corruptId: string | undefined
		try {
			for (const format of [
				'jpeg',
				'png',
				'webp',
				'avif',
				'tiff',
				'gif',
				'svg',
				'corrupt',
				'pdf',
				'video',
				'audio',
			]) {
				let bytes: Uint8Array
				let mime: string
				if (['jpeg', 'png', 'webp', 'avif', 'tiff', 'gif'].includes(format)) {
					bytes = await readFixture(new URL(`./fixtures/red.${format}`, import.meta.url))
					mime = `image/${format}`
				} else if (format === 'svg') {
					bytes = Buffer.from(
						'<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"><rect width="2" height="2" fill="red"/></svg>',
					)
					mime = 'image/svg+xml'
				} else {
					bytes = Buffer.from('invalid image fixture')
					mime =
						format === 'corrupt'
							? 'image/avif'
							: format === 'pdf'
								? 'application/pdf'
								: format === 'video'
									? 'video/mp4'
									: 'audio/mpeg'
				}
				const data = new FormData()
				data.append('folder', folder.id)
				data.append(
					'file',
					new Blob([new Uint8Array(bytes)], { type: mime }),
					`fixture.${format}`,
				)
				const file = await client.request(uploadFiles(data))
				ids.push(file.id)
				// Persist the declaration explicitly, including corrupt and non-image candidate fixtures.
				await client.request(updateFile(file.id, { type: mime }))
				if (
					['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/tiff'].includes(
						mime,
					)
				)
					imageIds.push(file.id)
				else {
					const explicit = await runOperation('ai-image-metadata', {
						files: file.id,
						mimeTypes: [mime],
					})
					expect(explicit.summary).toMatchObject({
						assetsTransformed: 0,
						transformsByMimeType: {},
					})
					expect(explicit.results[0]).toMatchObject({
						transformed: false,
						originalMimeType: mime,
						transformationDurationMs: 0,
						id: file.id,
						status: 'skipped',
						fields: [],
					})
				}
				if (['jpeg', 'png', 'webp'].includes(format)) {
					const explicit = await runOperation('ai-image-metadata', {
						files: file.id,
						prompt: `Describe the image. E2E_EXPECT_IMAGE:${Buffer.from(bytes).toString('base64')}`,
					})
					expect(explicit.results[0]?.status).toBe('updated')
					await client.request(updateFile(file.id, { description: null }))
				}
				if (format === 'corrupt') corruptId = file.id
				else if (
					['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/tiff'].includes(
						mime,
					)
				)
					originals.set(file.id, { bytes, mime })
			}
			const seen: string[] = []
			let transformedCount = 0
			const transformsByMimeType: Record<string, number> = {}
			let afterId: string | null = null
			for (let page = 0; page < 4; page += 1) {
				const output = await runOperation('ai-image-metadata-regenerate', {
					includeFolders: [{ key: folder.id, collection: 'directus_folders' }],
					mimeTypes: ['application/pdf'],
					maxFiles: 2,
					concurrency: 2,
					afterId,
				})
				expect(output.summary).toBeDefined()
				transformedCount += output.summary?.assetsTransformed ?? 0
				for (const [mime, count] of Object.entries(
					output.summary?.transformsByMimeType ?? {},
				))
					transformsByMimeType[mime] = (transformsByMimeType[mime] ?? 0) + count
				for (const result of output.results) {
					const mime =
						result.id === corruptId ? 'image/avif' : originals.get(result.id)?.mime
					expect(result.originalMimeType).toBe(mime)
					const transformed =
						result.id !== corruptId && (mime === 'image/avif' || mime === 'image/tiff')
					expect(result.transformed).toBe(transformed)
					if (transformed || result.id === corruptId)
						expect(result.transformationDurationMs).toBeGreaterThan(0)
					else expect(result.transformationDurationMs).toBe(0)
					seen.push(result.id)
					if (result.id === corruptId)
						expect(result).toMatchObject({
							status: 'failed',
							error: {
								stage: 'convert_image',
								code: 'IMAGE_TRANSFORM_FAILED',
								retryable: false,
							},
						})
					else expect(result.status).toBe('updated')
				}
				if (!output.nextCursor) break
				afterId = output.nextCursor
			}
			expect(transformedCount).toBe(2)
			expect(transformsByMimeType).toEqual({ 'image/avif': 1, 'image/tiff': 1 })
			expect(seen).toEqual([...imageIds].sort())
			expect(new Set(seen).size).toBe(imageIds.length)
			const convertedId = [...originals].find(
				([, original]) => original.mime === 'image/avif',
			)?.[0]
			const portableId = [...originals].find(
				([, original]) => original.mime === 'image/png',
			)?.[0]
			const failed = await runOperation('ai-image-metadata', {
				files: [convertedId, portableId],
				overwriteAltText: true,
				prompt: 'E2E_REJECT_PROVIDER',
			})
			expect(failed.summary).toMatchObject({
				filesFailed: 2,
				assetsTransformed: 1,
				transformsByMimeType: { 'image/avif': 1 },
			})
			expect(failed.results[0]).toMatchObject({
				id: convertedId,
				status: 'failed',
				transformed: true,
				originalMimeType: 'image/avif',
				error: { stage: 'generate' },
			})
			expect(failed.results[0]?.transformationDurationMs).toBeGreaterThan(0)
			expect(failed.results[1]).toMatchObject({
				id: portableId,
				status: 'failed',
				transformed: false,
				originalMimeType: 'image/png',
				transformationDurationMs: 0,
			})
			for (const [id, original] of originals) {
				expect(await client.request(readFile(id))).toMatchObject({
					type: original.mime,
					filename_download: expect.stringContaining('fixture.'),
				})
				const stored = await fetch(`${environment.DIRECTUS_E2E_URL}/assets/${id}`, {
					headers: { Authorization: `Bearer ${environment.DIRECTUS_E2E_TOKEN}` },
				})
				expect(Buffer.from(await stored.arrayBuffer())).toEqual(Buffer.from(original.bytes))
			}
		} finally {
			for (const id of ids) await client.request(deleteFile(id))
			await client.request(deleteFolder(folder.id))
		}
	})

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
			).toEqual([
				{
					id,
					status: 'skipped',
					fields: [],
					durationMs: expect.any(Number),
					transformed: false,
					originalMimeType: 'image/png',
					transformationDurationMs: 0,
				},
			])
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
			).toEqual([
				{
					id,
					status: 'skipped',
					fields: [],
					durationMs: expect.any(Number),
					transformed: false,
					originalMimeType: 'image/png',
					transformationDurationMs: 0,
				},
			])
			const legacy = await runOperation('ai-image-metadata', {
				files: id,
				mimeTypes: 'image/jpeg',
			})
			expect(legacy.results[0]?.status).toBe('updated')
			await client.request(updateFile(id, { description: null }))
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
					transformed: false,
					originalMimeType: 'image/png',
					transformationDurationMs: 0,
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
			).toEqual([
				{
					id,
					status: 'skipped',
					fields: [],
					durationMs: expect.any(Number),
					transformed: false,
					originalMimeType: 'image/png',
					transformationDurationMs: 0,
				},
			])
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
				{
					id,
					status: 'updated',
					fields: ['tags'],
					durationMs: expect.any(Number),
					transformed: false,
					originalMimeType: 'image/png',
					transformationDurationMs: 0,
				},
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
				{
					id,
					status: 'updated',
					fields: ['description'],
					durationMs: expect.any(Number),
					transformed: false,
					originalMimeType: 'image/png',
					transformationDurationMs: 0,
				},
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
			const updated = new Set<string>()
			let complete = false
			for (let iteration = 0; iteration < 20 && !complete; iteration += 1) {
				const page = await runOperation('ai-image-metadata-regenerate', {
					includeFolders: [{ key: folder.id, collection: 'directus_folders' }],
					maxFiles: 1,
					concurrency: 10,
				})
				for (const result of page.results)
					if (result.status === 'updated') updated.add(result.id)
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
	it('filters stored tag/description representations accountably and excludes completed files from the candidate limit', async () => {
		const folder = await client.request(createFolder({ name: 'Metadata representation test' }))
		const ids: string[] = []
		try {
			const variants = [null, '', '[]', [], [''], [' ', '\t'], ['meaningful'], 'legacy-tag']
			for (const tags of variants) {
				const id = await uploadImage(folder.id)
				ids.push(id)
				await client.request(
					customEndpoint({
						path: `/files/${id}`,
						method: 'PATCH',
						body: JSON.stringify({ description: 'Complete', tags }),
					}),
				)
			}
			// FilesService reads cast serialized arrays; DB predicates still operate on stored text.
			const representations = await client.request(
				readFiles({ filter: { folder: { _eq: folder.id } }, fields: ['id', 'tags'] }),
			)
			expect(representations.find((value) => value.id === ids[2])?.tags).toEqual([])
			expect(representations.find((value) => value.id === ids[3])?.tags).toEqual([])
			await expect(
				client.request(
					readFiles({
						filter: {
							_and: [{ folder: { _eq: folder.id } }, { tags: { _empty: true } }],
						},
					}),
				),
			).rejects.toThrow()
			await expect(
				client.request(
					customEndpoint({
						path: `/files?filter=${encodeURIComponent(JSON.stringify({ _and: [{ folder: { _eq: folder.id } }, { tags: { _eq: '[]' } }] }))}`,
						method: 'GET',
					}),
				),
			).rejects.toThrow()
			const nullMatches = await client.request(
				readFiles({
					filter: { _and: [{ folder: { _eq: folder.id } }, { tags: { _null: true } }] },
					fields: ['id'],
				}),
			)
			expect(nullMatches.map((value) => value.id)).toEqual([ids[0]])

			// Force an empty-array match below a NULL match so a two-pass reader would skip it.
			const missingIds = ids.slice(0, 6).sort()
			const lowest = missingIds[0]
			const highest = missingIds.at(-1)
			if (!lowest || !highest) throw new Error('Missing ordering fixtures')
			await client.request(updateFile(lowest, { tags: [] }))
			await client.request(updateFile(highest, { tags: null }))

			const options = {
				includeFolders: [{ key: folder.id, collection: 'directus_folders' }],
				generateAltText: false,
				generateTags: true,
				maxFiles: 1,
				concurrency: 10,
			}
			const selected: string[] = []
			let afterId: string | null = null
			for (let iteration = 0; iteration < 8; iteration += 1) {
				const output = await runOperation('ai-image-metadata-regenerate', {
					...options,
					afterId,
				})
				afterId = output.nextCursor ?? null
				selected.push(...output.results.map((result) => result.id))
				if (output.complete) break
			}
			expect(selected.sort()).toEqual(ids.slice(0, 6).sort())
			expect(new Set(selected).size).toBe(6)
			for (const id of ids.slice(0, 6))
				expect((await client.request(readFile(id))).tags).toEqual(['test', 'afbeelding'])
			for (const description of [null, '', ' \t\n', '\u00a0']) {
				const id = ids[0]
				if (!id) throw new Error('Missing fixture')
				await client.request(updateFile(id, { description }))
				const output = await runOperation('ai-image-metadata-regenerate', {
					...options,
					generateAltText: true,
					generateTags: false,
				})
				expect(output.results.map((result) => result.id)).toEqual([id])
			}
		} finally {
			for (const id of ids) await client.request(deleteFile(id))
			await client.request(deleteFolder(folder.id))
		}
	})

	it('continues regeneration by ID after deleting a prior file', async () => {
		const folder = await client.request(createFolder({ name: 'Metadata keyset test' }))
		const ids: string[] = []
		try {
			for (let index = 0; index < 3; index += 1) ids.push(await uploadImage(folder.id))
			ids.sort()
			const options = {
				includeFolders: [{ key: folder.id, collection: 'directus_folders' }],
				missingOnly: false,
				overwriteAltText: true,
				maxFiles: 1,
			}
			const first = await runOperation('ai-image-metadata-regenerate', options)
			expect(first.nextCursor).toBe(ids[0])
			const removed = ids.shift()
			if (!removed) throw new Error('Missing fixture')
			await client.request(deleteFile(removed))
			const next = await runOperation('ai-image-metadata-regenerate', {
				...options,
				afterId: first.nextCursor,
			})
			expect(next.results.map((result) => result.id)).toEqual([ids[0]])
		} finally {
			for (const id of ids) await client.request(deleteFile(id))
			await client.request(deleteFolder(folder.id))
		}
	})
	it('reports valid empty generated tags as unresolved and retries them on the next invocation', async () => {
		const folder = await client.request(createFolder({ name: 'Metadata unresolved test' }))
		let id: string | undefined
		try {
			id = await uploadImage(folder.id)
			const options = {
				includeFolders: [{ key: folder.id, collection: 'directus_folders' }],
				generateAltText: false,
				generateTags: true,
			}
			const unresolved = await runOperation('ai-image-metadata-regenerate', {
				...options,
				prompt: 'E2E_EMPTY_TAGS',
			})
			expect(unresolved.results[0]?.status).toBe('updated')
			expect(unresolved).toMatchObject({
				complete: false,
				remaining: true,
				remainingIds: [id],
			})
			const retried = await runOperation('ai-image-metadata-regenerate', options)
			expect(retried).toMatchObject({ complete: true, remaining: false, remainingIds: [] })
		} finally {
			if (id) await client.request(deleteFile(id))
			await client.request(deleteFolder(folder.id))
		}
	})
})
