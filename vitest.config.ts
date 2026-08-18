import { fileURLToPath, URL } from 'node:url'

import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vitest/config'

const e2eEnvironmentInitialized = [
	'DIRECTUS_E2E_URL',
	'DIRECTUS_E2E_TOKEN',
	'DIRECTUS_E2E_COMPOSE_FILES',
	'DIRECTUS_E2E_COMPOSE_PROJECT',
].every((name) => Boolean(process.env[name]))
const integrationEnvironmentInitialized = process.env.EXTENSION_UTILS_INTEGRATION === '1'

export default defineConfig({
	plugins: [vue()],
	resolve: {
		alias: [
			{
				find: /^@workspace\/test-utils$/u,
				replacement: fileURLToPath(
					new URL('./packages/test-utils/src/index.ts', import.meta.url),
				),
			},
			{
				find: /^@onderwijsin\/directus-extension-utils\/server$/u,
				replacement: fileURLToPath(
					new URL('./packages/extension-utils/src/server/index.ts', import.meta.url),
				),
			},
			{
				find: /^@onderwijsin\/directus-extension-utils$/u,
				replacement: fileURLToPath(
					new URL('./packages/extension-utils/src/index.ts', import.meta.url),
				),
			},
		],
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
		setupFiles: [fileURLToPath(new URL('./tests/setup.ts', import.meta.url))],
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
						'**/*.integration.{test,spec}.{js,jsx,ts,tsx}',
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
					testTimeout: 60_000,
					hookTimeout: 60_000,
					include: e2eEnvironmentInitialized
						? [
								'extensions/**/__tests__/**/*.e2e.{test,spec}.{js,jsx,ts,tsx}',
								'packages/**/__tests__/**/*.e2e.{test,spec}.{js,jsx,ts,tsx}',
								'tests/**/__tests__/**/*.e2e.{test,spec}.{js,jsx,ts,tsx}',
							]
						: [],
				},
			},
			{
				extends: true,
				test: {
					name: 'test:integration',
					environment: 'node',
					testTimeout: 30_000,
					hookTimeout: 30_000,
					include: integrationEnvironmentInitialized
						? ['packages/**/__tests__/**/*.integration.{test,spec}.{js,jsx,ts,tsx}']
						: [],
				},
			},
		],
	},
})
