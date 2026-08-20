import { defineConfig } from '@onderwijsin/directus-configuration-poc/config'

const secret = process.env.POC_SECRET
if (!secret) throw new Error('POC_SECRET is missing')

export default defineConfig({ value: secret })
