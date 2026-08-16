import { defineConfig } from 'tsdown'

export default defineConfig({
	clean: true,
	dts: true,
	entry: ['src/index.ts', 'src/app/index.ts', 'src/server/index.ts', 'src/shared/index.ts'],
	fixedExtension: false,
	format: ['esm'],
	sourcemap: true,
})
