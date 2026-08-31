import { describe, expect, it } from 'vitest'

import permalink from '../src/sluggernaut-permalink'
import slug from '../src/sluggernaut-slug'

interface InterfaceOption {
	field: string
	required?: boolean
	schema?: Record<string, unknown>
	meta?: { options?: Record<string, unknown>; conditions?: unknown }
}

describe('Sluggernaut interface option contracts', () => {
	it('uses arbitrary collection names and exposes complete slug options', () => {
		const options = (
			slug as unknown as { options: (context: unknown) => InterfaceOption[] }
		).options({ collection: 'éditeur_entries' })
		expect(options).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ field: 'sourceFields', required: true }),
				expect.objectContaining({ field: 'locale', schema: { default_value: 'nl' } }),
				expect.objectContaining({ field: 'lowercase', schema: { default_value: true } }),
				expect.objectContaining({
					field: 'updateOnSourceChange',
					schema: { default_value: true },
				}),
			]),
		)
		expect(
			options?.find((option) => option.field === 'sourceFields')?.meta?.options,
		).toMatchObject({ collectionName: 'éditeur_entries', multiple: true })
	})

	it('configures permalink field selection for the same collection and hides dependent options when standalone', () => {
		const options = (
			permalink as unknown as { options: (context: unknown) => InterfaceOption[] }
		).options({ collection: 'editorial_entries' })
		const slugField = options?.find((option) => option.field === 'slugField')
		expect(slugField?.meta?.options).toMatchObject({
			collectionName: 'editorial_entries',
			typeAllowList: ['string'],
			multiple: false,
		})
		expect(slugField?.meta?.conditions).toEqual([
			{ rule: { generateFromSlug: { _eq: false } }, hidden: true },
		])
		expect(options?.find((option) => option.field === 'generateFromSlug')?.schema).toEqual({
			default_value: true,
		})
	})

	it('keeps shared redirect options identical across interfaces', () => {
		const getOptions = (extension: unknown) =>
			(extension as { options: (context: unknown) => InterfaceOption[] }).options({
				collection: 'articles',
			})
		const sharedFields = [
			'automaticRedirects',
			'includeUnmanagedRedirectsInPlanning',
			'unmanagedRedirectConflictBehavior',
		]
		const slugOptions = getOptions(slug)
		const permalinkOptions = getOptions(permalink)

		expect(slugOptions.filter(({ field }) => sharedFields.includes(field))).toEqual(
			permalinkOptions.filter(({ field }) => sharedFields.includes(field)),
		)
	})
})
