import { defineConfig } from 'tsdown'

export default defineConfig({
	clean: true,
	dts: true,
	deps: {
		neverBundle: ['@directus/types', 'express'],
	},
	entry: [
		'src/index.ts',
		'src/hook.ts',
		'src/types.ts',
		'src/app/index.ts',
		'src/server/index.ts',
		'src/shared/index.ts',
		'src/server/sentry.ts',
		'src/constants.ts',
	],
	fixedExtension: false,
	format: ['esm'],
	sourcemap: true,
})
