import { createExtensionConfig } from '@onderwijsin/directus-extension-utils/extension.config.js'

// Extraction loads Oxfmt and its native binding from the installed package.
export default createExtensionConfig({ externals: ['oxfmt'] })
