import type { ApiExtensionContext, RegisterFunctions } from '@directus/types'
import type { CoolifyApplication } from '../shared/coolify-client/schemas'
import type { CoolifyDeploymentClient } from '../shared/coolify-client/types'

import { InvalidPayloadError } from '@directus/errors'
import {
	hasKey,
	isArray,
	isNonBlankString,
	isRecord,
	isString,
} from '@onderwijsin/directus-extension-utils'
import { attempt } from '@onderwijsin/directus-extension-utils/server'

import { safeHttpUrl } from '../coolify-deployments-endpoint/helpers'

type Filter = RegisterFunctions['filter']

const requiredApplicationFields: Record<string, string> = {
	name: 'name',
	projectUuid: 'project UUID',
	projectName: 'project name',
	environmentUuid: 'environment UUID',
	environmentName: 'environment name',
	fqdn: 'production URL',
} as const

const providerManagedFields = [
	'application_uuid',
	'name',
	'project_uuid',
	'project_name',
	'environment_uuid',
	'environment_name',
	'production_url',
] as const

/**
 * Convert a validated Coolify application response into a Directus collection item.
 * @param application - Normalized Coolify application response.
 * @param applicationUuid - UUID submitted by the Directus user.
 * @returns Provider-managed Directus fields.
 */
const mapApplication = (application: CoolifyApplication, applicationUuid: string) => {
	if (application.uuid !== applicationUuid) {
		throw new InvalidPayloadError({ reason: 'Coolify returned a different application UUID' })
	}

	/**
	 * Require a non-blank provider value for a Directus field.
	 * @param field - Normalized provider field name.
	 * @param value - Provider value to validate.
	 * @returns Trimmed provider value.
	 */
	const requireValue = (field: string, value: string | null): string => {
		if (!isNonBlankString(value)) {
			throw new InvalidPayloadError({
				reason: `Coolify application is missing ${requiredApplicationFields[field] ?? field}`,
			})
		}
		return value.trim()
	}

	const name = requireValue('name', application.name)
	const projectUuid = requireValue('projectUuid', application.projectUuid)
	const projectName = requireValue('projectName', application.projectName)
	const environmentUuid = requireValue('environmentUuid', application.environmentUuid)
	const environmentName = requireValue('environmentName', application.environmentName)
	const productionUrl = safeHttpUrl(requireValue('fqdn', application.fqdn?.split(',')[0] ?? null))
	if (!productionUrl) {
		throw new InvalidPayloadError({
			reason: 'Coolify application has an invalid production URL',
		})
	}

	return {
		application_uuid: application.uuid,
		name,
		project_uuid: projectUuid,
		project_name: projectName,
		environment_uuid: environmentUuid,
		environment_name: environmentName,
		production_url: productionUrl,
		enabled: true,
		deploy_enabled: true,
	}
}

/**
 * Register the create filter that enriches local applications from Coolify.
 * @param filter - Directus filter registration function.
 * @param collection - Configured local applications collection.
 * @param client - Coolify client used to fetch provider details.
 * @param logger - Directus extension logger.
 * @returns Nothing.
 */
export const registerApplicationEnrichmentHook = (
	filter: Filter,
	collection: string,
	client: Pick<CoolifyDeploymentClient, 'getApplication'>,
	logger: ApiExtensionContext['logger'],
): void => {
	filter(`${collection}.items.create`, async (payload) => {
		if (!isRecord(payload) || isArray(payload)) {
			throw new InvalidPayloadError({
				reason: 'Coolify application payload must be an object',
			})
		}

		const applicationUuid =
			hasKey(payload, 'application_uuid') && isString(payload.application_uuid)
				? payload.application_uuid.trim()
				: ''
		if (applicationUuid.length === 0) {
			throw new InvalidPayloadError({ reason: 'Coolify application UUID is required' })
		}

		const result = await attempt(() =>
			client.getApplication(applicationUuid, { bypassAllowList: true }),
		)
		if (result.error !== null) {
			logger.error({
				msg: 'Unable to load Coolify application during Directus create',
				applicationUuid,
				error: result.error,
			})
			throw new InvalidPayloadError({
				reason: 'Unable to load application details from Coolify',
			})
		}
		if (result.data === null) {
			throw new InvalidPayloadError({
				reason: 'Unable to load application details from Coolify',
			})
		}

		return { ...payload, ...mapApplication(result.data, applicationUuid) }
	})

	filter(`${collection}.items.update`, (payload) => {
		const payloads = isArray(payload) ? payload : [payload]
		for (const item of payloads) {
			if (!isRecord(item)) continue

			const changedProviderField = providerManagedFields.find((field) => hasKey(item, field))
			if (changedProviderField) {
				throw new InvalidPayloadError({
					reason: `${changedProviderField} is managed by Coolify and cannot be updated`,
				})
			}
		}

		return payload
	})
}
