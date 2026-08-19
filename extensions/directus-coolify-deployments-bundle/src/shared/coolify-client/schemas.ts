import { z } from 'zod'

export const deploymentStatuses = [
	'queued',
	'running',
	'success',
	'failed',
	'cancelled',
	'unknown',
] as const

const collectionNameSchema = z
	.string()
	.trim()
	.regex(/^[A-Za-z_][A-Za-z0-9_]*$/u)
	.refine((value) => !value.startsWith('directus_'), {
		message: 'Collection names may not start with directus_',
	})

const configuredCoolifyApplicationInputSchema = z
	.object({
		id: z.string().trim().min(1),
		name: z.string().trim().min(1),
		productionUrl: z.url().nullable().default(null),
		applicationUuid: z.string().trim().min(1).optional(),
		resourceUuid: z.string().trim().min(1).optional(),
	})
	.refine(
		({ applicationUuid, resourceUuid }) =>
			applicationUuid !== undefined || resourceUuid !== undefined,
		{
			message: 'Either applicationUuid or resourceUuid is required',
		},
	)

export const configuredCoolifyApplicationSchema = configuredCoolifyApplicationInputSchema.transform(
	({ resourceUuid, applicationUuid, ...application }) => {
		const resolvedApplicationUuid = applicationUuid ?? resourceUuid
		if (resolvedApplicationUuid === undefined) throw new Error('Application UUID is required')
		return { ...application, applicationUuid: resolvedApplicationUuid }
	},
)

export const coolifyEnvironmentSchema = z.object({
	COOLIFY_DEPLOYMENTS_ENABLED: z.boolean().default(true),
	COOLIFY_APPLICATIONS_COLLECTION: collectionNameSchema.default('coolify_applications'),
	COOLIFY_URL: z.url(),
	COOLIFY_TOKEN: z.string().trim().min(1),
	COOLIFY_PROJECTS: z.array(configuredCoolifyApplicationSchema).default([]),
})

export const envSchema = coolifyEnvironmentSchema

export const coolifyProjectSchema = z
	.object({
		id: z.number().int(),
		uuid: z.string().trim().min(1),
		name: z.string(),
		description: z.string().nullable().optional(),
	})
	.transform((project) => ({ ...project, description: project.description ?? null }))
export const coolifyProjectsResponseSchema = z.array(coolifyProjectSchema)

export const coolifyEnvironmentResponseSchema = z
	.object({
		id: z.number().int(),
		uuid: z.string().trim().min(1).nullable().optional(),
		name: z.string(),
		project_id: z.number().int().nullable().optional(),
		description: z.string().nullable().optional(),
	})
	.transform((environment) => ({
		id: environment.id,
		uuid: environment.uuid ?? null,
		name: environment.name,
		projectId: environment.project_id ?? null,
		description: environment.description ?? null,
	}))
export const coolifyEnvironmentsResponseSchema = z.array(coolifyEnvironmentResponseSchema)

export const coolifyApplicationSchema = z
	.object({
		id: z.number().int(),
		uuid: z.string().trim().min(1),
		name: z.string(),
		fqdn: z.string().nullable().optional(),
		status: z.string().nullable().optional(),
		environment_id: z.number().int().nullable().optional(),
	})
	.loose()
	.transform((application) => ({
		id: application.id,
		uuid: application.uuid,
		name: application.name,
		fqdn: application.fqdn ?? null,
		status: application.status ?? null,
		environmentId: application.environment_id ?? null,
	}))
export const coolifyApplicationsResponseSchema = z.array(coolifyApplicationSchema)

export const coolifyDeploymentSchema = z
	.object({
		id: z.number().int().nullable().optional(),
		application_id: z.string().trim().min(1),
		deployment_uuid: z.string().trim().min(1),
		pull_request_id: z.number().int().nullable().optional(),
		force_rebuild: z.boolean().nullable().optional(),
		commit: z.string().nullable().optional(),
		status: z.string().trim().min(1),
		created_at: z.string().nullable().optional(),
		updated_at: z.string().nullable().optional(),
		deployment_url: z.string().nullable().optional(),
		commit_message: z.string().nullable().optional(),
	})
	.loose()
	.transform((deployment) => ({
		id: deployment.id ?? null,
		applicationId: deployment.application_id,
		deploymentUuid: deployment.deployment_uuid,
		pullRequestId: deployment.pull_request_id ?? null,
		forceRebuild: deployment.force_rebuild ?? null,
		commit: deployment.commit ?? null,
		status: deployment.status,
		createdAt: deployment.created_at ?? null,
		updatedAt: deployment.updated_at ?? null,
		deploymentUrl: deployment.deployment_url ?? null,
		commitMessage: deployment.commit_message ?? null,
	}))

export const coolifyDeploymentsResponseSchema = z.array(coolifyDeploymentSchema)

export const coolifyDeploymentTriggerResponseSchema = z
	.object({
		deployments: z.array(
			z.object({
				message: z.string(),
				resource_uuid: z.string().trim().min(1),
				deployment_uuid: z.string().trim().min(1),
			}),
		),
	})
	.transform(({ deployments }) =>
		deployments.map(({ message, resource_uuid, deployment_uuid }) => ({
			message,
			resourceUuid: resource_uuid,
			deploymentUuid: deployment_uuid,
		})),
	)

export const coolifyDeploymentCancellationSchema = z
	.object({
		message: z.string(),
		deployment_uuid: z.string().trim().min(1),
		status: z.string().trim().min(1),
	})
	.transform(({ message, deployment_uuid, status }) => ({
		message,
		deploymentUuid: deployment_uuid,
		status,
	}))

export const coolifyApplicationFilterSchema = z.object({ tag: z.string().trim().min(1).optional() })

export const coolifyDeploymentRequestSchema = z
	.object({
		uuid: z.string().trim().min(1),
		force: z.boolean().optional(),
	})
	.strict()
	.refine(({ uuid }) => !uuid.includes(','), {
		message: 'Only one application UUID may be deployed at a time',
		path: ['uuid'],
	})

export const deploymentPaginationSchema = z.object({
	skip: z.coerce.number().int().nonnegative().default(0),
	take: z.coerce.number().int().positive().max(100).default(10),
})

export const deployRequestSchema = z.object({ force: z.boolean().default(true) })

export const normalizedDeploymentSchema = z.object({
	id: z.string(),
	applicationId: z.string(),
	status: z.enum(deploymentStatuses),
	rawStatus: z.string(),
	commitSha: z.string().nullable(),
	commitMessage: z.string().nullable(),
	deploymentUrl: z.url().nullable(),
	startedAt: z.iso.datetime().nullable(),
	finishedAt: z.iso.datetime().nullable(),
	duration: z.number().int().nonnegative().nullable(),
})

export const publicCoolifyProjectSchema = z.object({
	id: z.string(),
	name: z.string(),
	productionUrl: z.url().nullable(),
})

export const configuredApplicationReferenceSchema = z.object({
	id: z.string().trim().min(1),
	applicationUuid: z.string().trim().min(1),
})

export const deploymentPaginationInputSchema = deploymentPaginationSchema

export type CoolifyDeploymentsOptions = z.infer<typeof coolifyEnvironmentSchema>
export type CoolifyProject = z.infer<typeof coolifyProjectSchema>
export type CoolifyEnvironment = z.infer<typeof coolifyEnvironmentResponseSchema>
export type CoolifyApplication = z.infer<typeof coolifyApplicationSchema>
export type CoolifyDeployment = z.infer<typeof coolifyDeploymentSchema>
export type CoolifyDeploymentRequest = z.infer<typeof coolifyDeploymentRequestSchema>
export type CoolifyDeploymentTriggerResult = z.infer<
	typeof coolifyDeploymentTriggerResponseSchema
>[number]
export type CoolifyDeploymentCancellationResult = z.infer<
	typeof coolifyDeploymentCancellationSchema
>
export type CoolifyApplicationFilter = z.infer<typeof coolifyApplicationFilterSchema>
export type ConfiguredCoolifyApplication = z.infer<typeof configuredCoolifyApplicationSchema>
export type ConfiguredApplicationReference = z.infer<typeof configuredApplicationReferenceSchema>
export type DeploymentPagination = z.infer<typeof deploymentPaginationSchema>
export type NormalizedDeployment = z.infer<typeof normalizedDeploymentSchema>
export type PublicCoolifyProject = z.infer<typeof publicCoolifyProjectSchema>
