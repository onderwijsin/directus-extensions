import { z } from 'zod'

import { DEPLOYMENT_STATUSES } from './types'

const collectionNameSchema = z
	.string()
	.trim()
	.regex(/^[A-Za-z_][A-Za-z0-9_]*$/u)
	.refine((value) => !value.startsWith('directus_'), {
		message: 'Collection names may not start with directus_',
	})

const projectSchema = z.object({
	id: z.string().trim().min(1),
	name: z.string().trim().min(1),
	productionUrl: z.url().nullable().default(null),
	resourceUuid: z.string().trim().min(1),
})

export const coolifyEnvironmentSchema = z.object({
	COOLIFY_DEPLOYMENTS_ENABLED: z.boolean().default(true),
	COOLIFY_APPLICATIONS_COLLECTION: collectionNameSchema.default('coolify_applications'),
	COOLIFY_URL: z.url(),
	COOLIFY_TOKEN: z.string().trim().min(1),
	COOLIFY_PROJECTS: z.array(projectSchema).default([]),
})

export const envSchema = coolifyEnvironmentSchema

export const normalizedDeploymentSchema = z.object({
	id: z.string(),
	projectId: z.string(),
	status: z.enum(DEPLOYMENT_STATUSES),
	rawStatus: z.string(),
	commitSha: z.string().nullable(),
	commitMessage: z.string().nullable(),
	deploymentUrl: z.url().nullable(),
	startedAt: z.iso.datetime().nullable(),
	finishedAt: z.iso.datetime().nullable(),
	duration: z.number().int().nonnegative().nullable(),
})

const coolifyDeploymentSchema = z
	.object({
		id: z.number().int().nonnegative().optional(),
		application_id: z.string().nullable().optional(),
		deployment_uuid: z.string().trim().min(1),
		force_rebuild: z.boolean().optional(),
		commit: z.string().nullable().optional(),
		status: z.string().trim().min(1),
		created_at: z.string().nullable().optional(),
		updated_at: z.string().nullable().optional(),
		deployment_url: z.string().nullable().optional(),
		commit_message: z.string().nullable().optional(),
	})
	.passthrough()

export const coolifyDeploymentsResponseSchema = z.array(coolifyDeploymentSchema)

export const coolifyDeployResponseSchema = z.object({
	deployments: z.array(
		z.object({
			message: z.string(),
			resource_uuid: z.string().trim().min(1),
			deployment_uuid: z.string().trim().min(1),
		}),
	),
})

export const deploymentPaginationSchema = z.object({
	skip: z.coerce.number().int().nonnegative().default(0),
	take: z.coerce.number().int().positive().max(100).default(10),
})

export const deployRequestSchema = z.object({
	force: z.boolean().default(true),
})

export type CoolifyDeploymentsOptions = z.infer<typeof coolifyEnvironmentSchema>
export type CoolifyDeploymentResponse = z.infer<typeof coolifyDeploymentSchema>
