/**
 * Shared Directus extension build configuration
 *
 * This config marks Sentry and OpenTelemetry as external dependencies since
 * they're available at runtime via Directus instrumentation (Dockerfile).
 *
 * This keeps @sentry/node external to extension bundles while preserving
 * autocomplete and type support for consumers.
 *
 * Usage in extensions:
 * ```js
 * import config from '@workspace/extension-utils/extension.config.js'
 * export default config
 * ```
 *
 * Extensions can add their own runtime dependencies with `createExtensionConfig`:
 * ```js
 * import { createExtensionConfig } from '@workspace/extension-utils/extension.config.js'
 * export default createExtensionConfig({ externals: ['runtime-dependency'] })
 * ```
 *
 * Note: This uses an undocumented Rollup plugin workaround. While it works
 * with the official `plugins` array mechanism, it may break in future Directus
 * versions if they change their internal build process.
 *
 * References:
 * - https://github.com/directus/directus/discussions/18015
 * - https://github.com/directus/directus/issues/22939
 */
/** @type {string[]} */
const sharedExternals = [
	'@sentry/node',
	// OpenTelemetry dependencies that Sentry uses
	'@opentelemetry/api',
	'@opentelemetry/core',
	'@opentelemetry/instrumentation',
	'@opentelemetry/sdk-trace-base',
]

/**
 * Creates a Rollup plugin that adds dependencies to the extension's external list.
 *
 * @param {string[]} externals - Package names that should remain external.
 * @returns {{ name: string, options: (inputOptions: { external?: string[] }) => void }}
 *   Rollup plugin configuration.
 */
function externalPlugin(externals) {
	return {
		name: 'external-plugin',
		/**
		 * Adds this plugin's packages to Rollup's external dependency list.
		 *
		 * @param {{ external?: string[] }} inputOptions - Rollup input options.
		 * @returns {void}
		 */
		options(inputOptions) {
			inputOptions.external = [...(inputOptions.external ?? []), ...externals]
		},
	}
}

/**
 * Creates the shared Directus extension build configuration.
 *
 * @param {{ externals?: string[] }} [options] - Optional consumer-specific externals.
 * @returns {{ plugins: Array<{ name: string, options: (inputOptions: { external?: string[] }) => void }> }}
 *   Directus extension build configuration.
 */
export function createExtensionConfig({ externals = [] } = {}) {
	return {
		plugins: [externalPlugin([...sharedExternals, ...externals])],
	}
}

const config = createExtensionConfig()

export default config
