import { defineConfig } from 'tsdown'

export default defineConfig({
	entry: ['src/config.ts'],
	format: ['esm'],
	dts: false,
	clean: false,
	deps: {
		alwaysBundle: ['zod'],
	},
	outDir: 'dist',
})
