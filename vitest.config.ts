import { fileURLToPath, URL } from 'node:url'

import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vitest/config'

export default defineConfig({
	plugins: [vue()],
	resolve: {
		alias: {
			'@onderwijsin/directus-extension-utils': fileURLToPath(
				new URL('./packages/extension-utils/src/index.ts', import.meta.url),
			),
		},
	},
	test: {
		coverage: {
			provider: 'v8',
			reporter: ['text', 'text-summary', 'json-summary', 'cobertura'],
			include: [
				'extensions/**/src/**/*.{js,jsx,ts,tsx,vue}',
				'packages/**/src/**/*.{js,jsx,ts,tsx,vue}',
			],
			exclude: [
				'**/node_modules/**',
				'**/dist/**',
				'**/coverage/**',
				'**/__tests__/**',
				'**/*.d.ts',
			],
		},
		setupFiles: ['./tests/setup.ts'],
		projects: [
			{
				extends: true,
				test: {
					name: 'node',
					environment: 'node',
					include: ['**/*.{test,spec}.{js,jsx,ts,tsx}'],
					exclude: [
						'**/node_modules/**',
						'**/dist/**',
						'**/coverage/**',
						'**/*.e2e.{test,spec}.{js,jsx,ts,tsx}',
						'**/*.dom.{test,spec}.{js,jsx,ts,tsx}',
						'**/*.vue.{test,spec}.{js,jsx,ts,tsx}',
					],
				},
			},
			{
				extends: true,
				test: {
					name: 'vue',
					environment: 'happy-dom',
					exclude: ['**/node_modules/**', '**/dist/**', '**/coverage/**'],
					include: [
						'**/*.dom.{test,spec}.{js,jsx,ts,tsx}',
						'**/*.vue.{test,spec}.{js,jsx,ts,tsx}',
					],
				},
			},
			{
				extends: true,
				test: {
					name: 'e2e',
					environment: 'node',
					include: [
						'extensions/**/__tests__/**/*.e2e.{test,spec}.{js,jsx,ts,tsx}',
						'packages/**/__tests__/**/*.e2e.{test,spec}.{js,jsx,ts,tsx}',
					],
				},
			},
		],
	},
})
