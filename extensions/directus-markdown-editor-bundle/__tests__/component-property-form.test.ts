import { describe, expect, it } from 'vitest'

import {
	createObjectDraft,
	hasImageProperty,
	validatePropertyDrafts,
} from '../src/markdown-editor-interface/component-meta/property-form'
import { normalizeComponentMetadata } from '../src/markdown-editor-interface/component-meta/schema'
import { componentRequiresProps } from '../src/markdown-editor-interface/editor/insertion'
import {
	parseMdcAttributes,
	serializeMdcAttributes,
} from '../src/markdown-editor-interface/markdown/attributes'

const component = normalizeComponentMetadata([
	{
		name: 'Hero',
		nodeType: 'block',
		slots: ['default'],
		props: {
			image: {
				type: 'object',
				properties: {
					src: {
						type: 'string',
						required: true,
						tags: [{ name: 'specialInputType', text: 'image' }],
					},
					alt: { type: 'string' },
				},
			},
			actions: {
				type: 'array',
				items: {
					type: 'object',
					properties: {
						label: { type: 'string', required: true },
						to: {
							type: 'string',
							required: true,
							tags: [{ name: 'specialInputType', text: 'url' }],
						},
						icon: {
							type: 'string',
							tags: [
								{
									name: 'specialInputType',
									text: 'icon',
									config: { collections: ['lucide'] },
								},
							],
						},
					},
				},
			},
			tags: { type: 'array', items: { type: 'string' } },
			tones: { type: 'array', values: ['primary', 'secondary'], items: { type: 'string' } },
		},
	},
])[0]

if (!component) throw new Error('Hero metadata did not normalize.')

describe('recursive component properties', () => {
	it('preserves endpoint property trees and chooses a drawer for required descendants', () => {
		expect(component.props.actions?.items?.properties?.to?.tags?.[0]?.config).toEqual(undefined)
		expect(component.props.actions?.items?.properties?.icon?.tags?.[0]?.config).toEqual({
			collections: ['lucide'],
		})
		expect(componentRequiresProps(component)).toBe(false)
		expect(hasImageProperty(component.props)).toBe(true)
	})

	it('validates required and URL fields in object rows without treating an absent optional object as present', () => {
		expect(
			validatePropertyDrafts(component.props, { actions: [{ label: '', to: 'broken' }] }),
		).toEqual({
			'actions.0.label': 'This field is required.',
			'actions.0.to': expect.any(String),
		})
		expect(validatePropertyDrafts(component.props, { image: {}, actions: [] })).toEqual({
			'image.src': 'This field is required.',
		})
		expect(createObjectDraft(component.props.actions?.items ?? {})).toEqual({
			label: '',
			to: '',
		})
	})

	it('round trips nested objects and object arrays through MDC attributes', () => {
		const values = {
			image: { src: '/assets/file-id', alt: 'Landscape' },
			actions: [{ label: 'Open', to: 'https://example.com', icon: 'lucide:arrow-up' }],
			tags: ['news', 'featured'],
		}
		const encoded = serializeMdcAttributes(values)
		expect(parseMdcAttributes(encoded.slice(1, -1))).toEqual(values)
	})
})
