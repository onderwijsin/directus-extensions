import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import { metadataAppOptions } from '../src/shared/configuration/app-options'
import { createMetadataEnvironmentShape } from '../src/shared/configuration/env'
import { acceptedLanguages, defaultLanguage } from '../src/shared/configuration/languages'
import { optionsSchema } from '../src/shared/configuration/options'
import { defaultPrompt } from '../src/shared/providers/provider'
import { createMetadataSystemPrompt } from '../src/shared/providers/system-prompt'

const env = { AI_METADATA_WRITER_LANGUAGE: 'Dutch' }

describe('metadata language configuration', () => {
	it('defaults the environment language to English and rejects unsupported values', () => {
		const schema = z.object(createMetadataEnvironmentShape(z))
		expect(schema.parse({}).AI_METADATA_WRITER_LANGUAGE).toBe('English')
		expect(schema.safeParse({ AI_METADATA_WRITER_LANGUAGE: 'Klingon' }).success).toBe(false)
	})
	it.each(acceptedLanguages)('accepts %s in environment validation', (language) => {
		expect(
			z
				.object(createMetadataEnvironmentShape(z))
				.parse({ AI_METADATA_WRITER_LANGUAGE: language }).AI_METADATA_WRITER_LANGUAGE,
		).toBe(language)
	})
	it.each(acceptedLanguages)('accepts %s in operation validation', (language) => {
		expect(optionsSchema.parse({ language }).language).toBe(language)
	})
	it.each([undefined, null, ''])(
		'uses the global language for a cleared override: %s',
		(language) => {
			const options = optionsSchema.parse({ language })
			expect(createMetadataSystemPrompt(options, env)).toContain('Metadata language: Dutch.')
		},
	)
	it.each(['Klingon', 'dutch', 'nl', 42])(
		'rejects unsupported operation languages: %s',
		(language) => {
			expect(optionsSchema.safeParse({ language }).success).toBe(false)
		},
	)
	it('uses every accepted language in the Studio dropdown', () => {
		const languageField = metadataAppOptions.find((field) => field.field === 'language')
		expect(languageField?.meta?.options).toEqual({
			choices: acceptedLanguages.map((value) => ({ text: value, value })),
		})
	})
	it('appends language after operation and environment prompt overrides', () => {
		const prompt = createMetadataSystemPrompt(
			{ language: 'French', prompt: 'Describe visible text.' },
			{ ...env, AI_METADATA_WRITER_PROMPT: 'Environment instructions' },
		)
		expect(prompt).toMatch(/^Describe visible text\./u)
		expect(prompt).toContain('Metadata language: French.')
		expect(prompt).toContain('alt text, tags, and descriptive filename words in French')
		expect(prompt).toContain('Transliterate filename words')
		expect(prompt).toContain('Keep JSON property names unchanged')
	})
	it('keeps environment and accessibility instructions when language is defaulted', () => {
		const defaults = createMetadataSystemPrompt(
			{},
			{ AI_METADATA_WRITER_LANGUAGE: defaultLanguage },
		)
		expect(defaults.startsWith(defaultPrompt)).toBe(true)
		expect(defaults).toContain('Metadata language: English.')
		expect(
			createMetadataSystemPrompt(
				{},
				{ ...env, AI_METADATA_WRITER_PROMPT: 'Environment instructions' },
			),
		).toMatch(/^Environment instructions/u)
	})
})
