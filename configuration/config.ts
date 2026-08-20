import { defineConfig } from '@onderwijsin/directus-configuration-poc/config'

const secret = process.env.POC_SECRET

export default defineConfig({
	value: secret ?? 'local-poc-secret',
})
