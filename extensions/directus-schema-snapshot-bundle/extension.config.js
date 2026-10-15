import { createExtensionConfig } from '@onderwijsin/directus-extension-utils/extension.config.js'

// Preserve the license state shared with the Directus host.
export default createExtensionConfig({ externals: ['@directus/api/license/index'] })
