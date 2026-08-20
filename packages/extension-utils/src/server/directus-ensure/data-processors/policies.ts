import type { Permission, PermissionsAction, Policy } from '@directus/types'

import { z } from 'zod'

import { isNonBlankString, isRecord } from '../../../shared'

const permissionActionSchema = z.enum([
	'create',
	'read',
	'update',
	'delete',
	'share',
]) satisfies z.ZodType<PermissionsAction>

const permissionDefinitionSchema: z.ZodType<DirectusPermissionDefinition> = z.object({
	collection: z.string().trim().min(1),
	action: permissionActionSchema,
	permissions: z
		.custom<Permission['permissions']>((value) => value === null || isRecord(value), {
			message: 'Expected a permission filter object or null',
		})
		.nullable()
		.default(null),
	validation: z
		.custom<Permission['validation']>((value) => value === null || isRecord(value), {
			message: 'Expected a validation filter object or null',
		})
		.nullable()
		.default(null),
	presets: z
		.custom<Permission['presets']>((value) => value === null || isRecord(value), {
			message: 'Expected presets or null',
		})
		.nullable()
		.default(null),
	fields: z.array(z.string()).nullable().default(null),
})

const policyDefinitionSchema: z.ZodType<DirectusPolicyDefinition> = z.object({
	id: z.string().trim().min(1),
	name: z.string().trim().min(1),
	icon: z.string(),
	description: z.string().nullable(),
	enforce_tfa: z.boolean().nullable(),
	ip_access: z.array(z.string()).nullable(),
	app_access: z.boolean(),
	admin_access: z.boolean(),
	permissions: z.array(permissionDefinitionSchema),
})

const policyDefinitionsSchema: z.ZodType<DirectusPolicyDefinitions> = z.object({
	policies: z.array(policyDefinitionSchema),
})

/** A permission definition nested inside an extension-owned policy definition. */
export type DirectusPermissionDefinition = Omit<Permission, 'id' | 'policy' | 'system'>

/** A policy definition with its child permissions declared inline. */
export type DirectusPolicyDefinition = Policy & {
	permissions: DirectusPermissionDefinition[]
}

/** A portable collection of policy definitions. */
export interface DirectusPolicyDefinitions {
	policies: DirectusPolicyDefinition[]
}

/** A validated policy split into the policy row and linked permission rows. */
export interface ProcessedDirectusPolicyDefinition {
	policy: Policy
	permissions: Permission[]
}

/**
 * Validates extension-owned Directus policy definitions.
 * @param input - Bundled JSON or another unknown policy definition.
 * @returns Typed policy definitions with nested permissions.
 */
export function validatePolicyDefinition(input: unknown): DirectusPolicyDefinitions {
	return policyDefinitionsSchema.parse(input)
}

/**
 * Splits one nested policy definition into Directus policy and permission rows.
 * @param definition - Validated policy definition.
 * @param policyId - Optional configured policy identifier.
 * @returns A policy row and permission rows linked to that policy.
 */
export function processPolicyDefinition(
	definition: DirectusPolicyDefinition,
	policyId = definition.id,
): ProcessedDirectusPolicyDefinition {
	if (!isNonBlankString(policyId)) throw new Error('Directus policy id must be non-blank')

	const { permissions, ...policy } = definition
	return {
		policy: { ...policy, id: policyId },
		permissions: permissions.map((permission) => ({
			...permission,
			policy: policyId,
		})),
	}
}
