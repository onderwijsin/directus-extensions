import type { ApiExtensionContext, SchemaOverview } from '@directus/types'

import { attempt } from '../../../shared/attempt'
import { isNonBlankString } from '../../../shared/guards'
import { getDirectusStartupLockName } from '../config'
import { processPolicyDefinition } from '../data-processors/policies'
import {
	resolveDirectusLockProvider,
	type EnsureDirectusPolicyInput,
	type EnsureDirectusSchemaResult,
} from './core'

type Services = ApiExtensionContext['services']
type PoliciesService = InstanceType<Services['PoliciesService']>
type ItemsService = InstanceType<Services['ItemsService']>
type ServiceOptions = ConstructorParameters<Services['CollectionsService']>[0]

/**
 * Builds constructor options for a Directus policy service.
 * @param database - Directus database connection.
 * @param schema - Current schema overview.
 * @returns Service constructor options.
 */
const serviceOptions = (
	database: EnsureDirectusPolicyInput['database'],
	schema: SchemaOverview,
): ServiceOptions => ({
	knex: database,
	accountability: null,
	schema,
})

/**
 * Ensures a Directus policy exists without modifying an existing policy.
 * @param input - Policy definition, Directus services, and operation options.
 * @returns The resources created by the operation.
 */
export async function ensureDirectusPolicy(
	input: EnsureDirectusPolicyInput,
): Promise<EnsureDirectusSchemaResult> {
	const { id, logger, services, definition } = input
	const options = input.options ?? {}
	const changed: string[] = []

	logger.info({
		msg: '🚀 Starting Directus data seed',
		id,
		resources: { policies: 1, permissions: definition.permissions.length },
		locking: true,
	})
	if (options.lockProviderConfig?.DIRECTUS_EXTENSIONS_DATA_SEED_ENABLED === false) {
		logger.info({ msg: '⏭️ Directus data seed disabled globally', id })
		return { changed, skipped: true }
	}

	const configuredProvider = resolveDirectusLockProvider(options)
	const provider = configuredProvider.provider
	let lease = null
	const startedAt = Date.now()

	try {
		// Validate the stable policy identity before acquiring the shared startup lease.
		if (!isNonBlankString(definition.id) || !isNonBlankString(definition.name)) {
			throw new Error('Directus policy id and name must be non-blank')
		}
		lease = await provider.tryAcquire(getDirectusStartupLockName(id), {
			...(options.lockLeaseMs === undefined ? {} : { leaseMs: options.lockLeaseMs }),
		})
		if (!lease) {
			logger.info({
				msg: '⏭️ Directus data seed skipped; another operation holds the lock',
				id,
			})
			return { changed, skipped: true }
		}

		// Resolve by UUID first, then by name, so an existing policy is never duplicated.
		const result = await attempt(async () => {
			const schema = await input.getSchema({ database: input.database, bypassCache: true })
			const policyService: PoliciesService = new services.PoliciesService(
				serviceOptions(input.database, schema),
			)
			const existingById = await attempt(() => policyService.readOne(definition.id))
			const existing =
				existingById.error === null
					? existingById.data
					: (
							await policyService.readByQuery({
								filter: { name: { _eq: definition.name } },
								limit: 1,
							})
						)[0]

			const policyId = existing?.id ?? definition.id
			if (existing) {
				if (existing.id !== definition.id || existing.name !== definition.name) {
					logger.error({
						msg: 'Incompatible Directus policy; preserving the existing resource',
						policy: definition.id,
						expectedName: definition.name,
						actualId: existing.id,
						actualName: existing.name,
					})
					return
				}
			} else {
				await policyService.createOne(processPolicyDefinition(definition).policy)
				changed.push('policy:' + definition.id)
				logger.debug?.({ msg: '🛠️ Created Directus policy', policy: definition.id })
			}

			const permissionService: ItemsService = new services.PermissionsService(
				serviceOptions(input.database, schema),
			)
			for (const permission of processPolicyDefinition(definition, policyId).permissions) {
				const existingPermissions = await permissionService.readByQuery({
					filter: {
						policy: { _eq: policyId },
						collection: { _eq: permission.collection },
						action: { _eq: permission.action },
					},
					limit: 1,
				})
				if (existingPermissions[0]) continue
				await permissionService.createOne(permission)
				changed.push(`permission:${policyId}:${permission.collection}:${permission.action}`)
			}
		})
		if (result.error !== null) {
			// Preserve the same abort-on-error contract as schema ensures.
			logger.error({
				msg: '❌ Directus data seed failed',
				id,
				cause: result.error instanceof Error ? result.error.message : result.error,
			})
			if (options.abortOnError ?? true) {
				throw result.error instanceof Error
					? result.error
					: new Error(JSON.stringify(result.error) ?? 'Unknown data seed failure')
			}
			logger.warn({ msg: '⚠️ Continuing after data seed failure', id })
		}
		logger.info({
			msg: '✅ Directus data seed completed',
			id,
			changed,
			changedCount: changed.length,
			durationMs: Date.now() - startedAt,
		})
		return { changed, skipped: false }
	} finally {
		if (lease) await lease.release()
		if (!options.lockProvider) await configuredProvider.dispose()
	}
}

export type { EnsureDirectusPolicyInput } from './core'
