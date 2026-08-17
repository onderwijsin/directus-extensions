import { describe, expect, it } from 'vitest'

import config, { createExtensionConfig } from './extension.config.js'

const sharedExternals = [
	'@sentry/node',
	'@opentelemetry/api',
	'@opentelemetry/core',
	'@opentelemetry/instrumentation',
	'@opentelemetry/sdk-trace-base',
]

function applyExternalPlugin(extensionConfig: typeof config) {
	const inputOptions = { external: ['@directus/extensions-sdk'] }
	const plugin = extensionConfig.plugins[0]

	plugin.options(inputOptions)

	return inputOptions.external
}

describe('extension config', () => {
	it('preserves the shared externals in the default export', () => {
		expect(applyExternalPlugin(config)).toEqual([
			'@directus/extensions-sdk',
			...sharedExternals,
		])
	})

	it('combines shared and extension-specific externals', () => {
		const extensionConfig = createExtensionConfig({ externals: ['oxfmt'] })

		expect(applyExternalPlugin(extensionConfig)).toEqual([
			'@directus/extensions-sdk',
			...sharedExternals,
			'oxfmt',
		])
	})
})
