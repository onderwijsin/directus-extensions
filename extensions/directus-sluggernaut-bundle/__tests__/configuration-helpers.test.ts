import { describe, expect, it, vi } from 'vitest'

import {
	getConfiguration,
	logConfigurationWarnings,
} from '../src/sluggernaut-hook/mutation/helpers'

describe('Sluggernaut configuration helper diagnostics', () => {
	it('forwards field-reader metadata and emits stable warning context', async () => {
		const fieldReader = {
			read: vi.fn().mockResolvedValue([
				{ field: 'title' },
				{
					field: 'bad_slug',
					meta: {
						interface: 'sluggernaut-slug',
						options: {
							sourceFields: ['missing'],
							locale: 'en',
							lowercase: true,
							updateOnSourceChange: true,
							automaticRedirects: false,
						},
					},
				},
			]),
		}
		const configuration = await getConfiguration('editorial_entries', {
			...fieldReader,
			clearCache: vi.fn(),
		})
		expect(fieldReader.read).toHaveBeenCalledWith('editorial_entries')
		const logger = { warn: vi.fn() }
		logConfigurationWarnings('editorial_entries', configuration, { logger } as never)
		expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('bad_slug'), {
			collection: 'editorial_entries',
			field: 'bad_slug',
			code: 'invalid-source-reference',
		})
	})
})
