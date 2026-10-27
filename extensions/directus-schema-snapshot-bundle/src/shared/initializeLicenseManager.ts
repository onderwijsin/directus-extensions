import { isFunction, isRecord } from '@onderwijsin/directus-extension-utils'

/**
 * Initializes the Directus host's license singleton before CLI schema application.
 * @returns A promise that resolves after license initialization.
 */
export async function initializeLicenseManager(): Promise<void> {
	// Directus 12 does not initialize licensing for extension CLI commands (directus/directus#27833).
	// The variable import keeps the host-provided ESM module external to the extension bundle.
	const licensePath = '@directus/api/license/index'
	const licenseModule: unknown = await import(licensePath)
	if (!isRecord(licenseModule) || !isFunction(licenseModule.getLicenseManager)) {
		throw new Error('Directus license manager is unavailable')
	}
	const manager = licenseModule.getLicenseManager()
	if (!isRecord(manager) || !isFunction(manager.initialize)) {
		throw new Error('Directus license manager cannot be initialized')
	}
	await manager.initialize()
}
