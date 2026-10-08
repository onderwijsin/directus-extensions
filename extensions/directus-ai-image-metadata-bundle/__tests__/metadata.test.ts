import { describe, expect, it } from 'vitest'

import { metadataAppOptions } from '../src/shared/app-options'
import { imageMimeTypes } from '../src/shared/image-mime-types'
import {
	createMetadataPatch,
	hasMissingMetadata,
	isSelected,
	needsMetadataUpdate,
} from '../src/shared/metadata'
import {
	backfillOptionsSchema,
	fileSchema,
	metadataSchema,
	optionsSchema,
	writerOptionsSchema,
} from '../src/shared/options'

const id = '11111111-1111-4111-8111-111111111111'
const folder = '22222222-2222-4222-8222-222222222222'
const file = fileSchema.parse({
	id,
	folder: null,
	type: 'image/png',
	description: null,
	tags: null,
	filename_download: 'original.PNG',
})
const generated = metadataSchema.parse({
	altText: 'A red bicycle beside a brick wall.',
	tags: ['bicycle', 'red', 'bicycle'],
	filename: 'red-bicycle',
})

describe('image metadata contracts', () => {
	it('uses environment fallbacks when optional Studio strings are cleared', () => {
		expect(optionsSchema.parse({ provider: null, model: '', prompt: null })).toMatchObject({
			provider: undefined,
			model: undefined,
			prompt: undefined,
		})
	})
	it('preserves populated fields independently while filling missing metadata', () => {
		const options = optionsSchema.parse({ generateTags: true, generateFilename: true })
		expect(createMetadataPatch(file, generated, options)).toEqual({
			description: generated.altText,
			tags: ['bicycle', 'red'],
		})
		expect(
			createMetadataPatch(
				{ ...file, description: 'Human description', tags: ['human'] },
				generated,
				options,
			),
		).toEqual({})
	})
	it('renames only the download filename and retains its original extension on overwrite', () => {
		expect(
			createMetadataPatch(
				file,
				generated,
				optionsSchema.parse({ generateFilename: true, overwriteFilename: true }),
			),
		).toEqual({ description: generated.altText, filename_download: 'red-bicycle.PNG' })
	})
	it.each([
		{ options: { overwriteAltText: true }, patch: { description: generated.altText } },
		{
			options: { generateTags: true, overwriteTags: true },
			patch: { tags: ['bicycle', 'red'] },
		},
		{
			options: { generateFilename: true, overwriteFilename: true },
			patch: { filename_download: 'red-bicycle.PNG' },
		},
	])('overwrites only the selected populated field: $options', ({ options, patch }) => {
		const complete = { ...file, description: 'Human description', tags: ['manual'] }
		const parsed = optionsSchema.parse(options)
		expect(hasMissingMetadata(complete, parsed)).toBe(false)
		expect(needsMetadataUpdate(complete, parsed)).toBe(true)
		expect(createMetadataPatch(complete, generated, parsed)).toEqual(patch)
	})
	it('ignores optional overwrite controls when generation is disabled', () => {
		const complete = { ...file, description: 'Human description', tags: ['manual'] }
		const options = optionsSchema.parse({ overwriteTags: true, overwriteFilename: true })
		expect(needsMetadataUpdate(complete, options)).toBe(false)
		expect(createMetadataPatch(complete, generated, options)).toEqual({})
	})
	it('can replace all fields when each overwrite is enabled', () => {
		expect(
			createMetadataPatch(
				{ ...file, description: 'Human', tags: ['manual'] },
				generated,
				optionsSchema.parse({
					generateTags: true,
					generateFilename: true,
					overwriteAltText: true,
					overwriteTags: true,
					overwriteFilename: true,
				}),
			),
		).toEqual({
			description: generated.altText,
			tags: ['bicycle', 'red'],
			filename_download: 'red-bicycle.PNG',
		})
	})
	it('treats whitespace and blank tag arrays as missing', () => {
		const options = optionsSchema.parse({ generateTags: true })
		expect(hasMissingMetadata({ ...file, description: ' ', tags: [' '] }, options)).toBe(true)
		expect(hasMissingMetadata({ ...file, description: 'Existing', tags: [' '] }, options)).toBe(
			true,
		)
		expect(
			hasMissingMetadata({ ...file, description: 'Existing', tags: ['tag'] }, options),
		).toBe(false)
		expect(
			hasMissingMetadata(
				{ ...file, description: 'Existing', tags: null },
				optionsSchema.parse({}),
			),
		).toBe(false)
	})
	it('requires an image MIME type and applies exact folders with exclusion precedence', () => {
		const options = optionsSchema.parse({
			includeFolders: [{ key: folder, collection: 'directus_folders' }],
			includeRoot: true,
			excludeFolders: [{ key: folder, collection: 'directus_folders' }],
		})
		expect(isSelected(file, options)).toBe(true)
		expect(isSelected({ ...file, folder }, options)).toBe(false)
		expect(isSelected({ ...file, type: 'video/png' }, options)).toBe(false)
		for (const type of imageMimeTypes) expect(isSelected({ ...file, type }, options)).toBe(true)
		expect(isSelected({ ...file, type: 'image/svg+xml' }, options)).toBe(false)
		expect(isSelected({ ...file, type: 'image/heic' }, options)).toBe(false)
		expect(isSelected({ ...file, type: 'image/vnd.adobe.photoshop' }, options)).toBe(false)
		expect(isSelected({ ...file, type: ' IMAGE/PNG ' }, options)).toBe(true)
	})
	it('normalizes singular list inputs and removes duplicate file IDs', () => {
		expect(
			writerOptionsSchema.parse({
				files: [id, id],
				includeRoot: true,
				mimeTypes: 'IMAGE/PNG',
			}),
		).toMatchObject({ files: [id], includeFolders: [null], mimeTypes: ['image/png'] })
	})
	it.each([
		{ files: 'invalid' },
		{ files: [] },
		{ files: id, mimeTypes: 'video/mp4' },
		{ files: id, mimeTypes: [] },
		{ files: id, overwriteAltText: 'false' },
		{ files: id, overwriteTags: 'false' },
		{ files: id, overwriteFilename: 'false' },
	])('rejects malformed Flow options: %j', (options) => {
		expect(writerOptionsSchema.safeParse(options).success).toBe(false)
	})
	it.each([0, 1001, 1.5])('rejects an invalid backfill bound: %s', (maxFiles) => {
		expect(backfillOptionsSchema.safeParse({ maxFiles }).success).toBe(false)
	})
	it.each(['../file', 'name.png', 'UPPER', '', 'a/b'])(
		'rejects unsafe generated filename stems: %s',
		(filename) => {
			expect(metadataSchema.safeParse({ ...generated, filename }).success).toBe(false)
		},
	)
})

describe('native folder selection', () => {
	const selection = { key: folder, collection: 'directus_folders' }
	it.each([optionsSchema, backfillOptionsSchema])(
		'normalizes objects, duplicates and root for both operations',
		(schema) => {
			const options = schema.parse({
				includeFolders: [selection, selection],
				includeRoot: true,
				excludeFolders: [selection],
			})
			expect(options.includeFolders).toEqual([folder, null])
			expect(options.excludeFolders).toEqual([folder])
			expect(isSelected(file, options)).toBe(true)
			expect(isSelected({ ...file, folder }, options)).toBe(false)
			expect(isSelected({ ...file, folder: id }, options)).toBe(false)
			expect(isSelected(file, schema.parse({ includeRoot: true, excludeRoot: true }))).toBe(
				false,
			)
		},
	)
	it.each([null, []])('treats cleared native selection as empty: %j', (value) => {
		expect(optionsSchema.parse({ includeFolders: value }).includeFolders).toEqual([])
		expect(
			optionsSchema.parse({ includeFolders: value, includeRoot: true }).includeFolders,
		).toEqual([null])
	})
	it.each([
		{ collection: 'directus_files', key: folder },
		{ collection: 'directus_folders', key: 'invalid' },
		{ collection: 'directus_folders' },
		folder,
		null,
	])('rejects malformed native selections: %j', (value) => {
		for (const field of ['includeFolders', 'excludeFolders']) {
			expect(backfillOptionsSchema.safeParse({ [field]: [value] }).success).toBe(false)
			expect(writerOptionsSchema.safeParse({ files: id, [field]: [value] }).success).toBe(
				false,
			)
		}
	})
	it('uses named native folders in shared Studio options', () => {
		for (const field of ['includeFolders', 'excludeFolders']) {
			expect(metadataAppOptions.find((option) => option.field === field)?.meta).toMatchObject(
				{
					interface: 'collection-item-multiple-dropdown',
					options: { selectedCollection: 'directus_folders', template: '{{ name }}' },
				},
			)
		}
	})
})
