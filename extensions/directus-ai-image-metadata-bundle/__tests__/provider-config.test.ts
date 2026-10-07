import { describe, expect, it } from 'vitest'

import { MetadataUnavailableError } from '../src/shared/contracts'
import { describeProviderConfiguration } from '../src/shared/provider-config'

describe('provider configuration guidance', () => {
	it('identifies all missing settings', () => {
		const reason = describeProviderConfiguration({})
		expect(reason).toContain('AI_METADATA_WRITER_PROVIDER')
		expect(reason).toContain('AI_METADATA_WRITER_MODEL')
		expect(reason).toContain('AI_METADATA_WRITER_API_KEY')
		expect(new MetadataUnavailableError({ reason }).message).toContain(reason)
	})
	it('identifies a missing compatible endpoint without reporting credentials', () => {
		const reason = describeProviderConfiguration({
			provider: 'openai-compatible',
			model: 'vision',
			apiKey: 'private-secret',
		})
		expect(reason).toContain('AI_METADATA_WRITER_BASE_URL')
		expect(reason).not.toContain('private-secret')
		expect(reason).not.toContain('AI_METADATA_WRITER_API_KEY')
	})
	it('does not echo invalid provider or URL values', () => {
		const reason = describeProviderConfiguration({
			provider: 'private-provider',
			model: 'vision',
			apiKey: 'private-secret',
			baseURL: 'private-url',
		})
		expect(reason).toContain('supported provider')
		expect(reason).toContain('valid absolute URL')
		expect(reason).not.toContain('private-')
	})
	it('explains missing model even when Directus credentials are available', () => {
		expect(describeProviderConfiguration({ provider: 'openai', apiKey: 'secret' })).toContain(
			'Directus settings do not supply a default model',
		)
	})
})
