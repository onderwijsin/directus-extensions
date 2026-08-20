import { z } from 'zod'

const collectionNameSchema = z
	.string()
	.trim()
	.regex(/^[A-Za-z_][A-Za-z0-9_]*$/u)
	.refine((value) => !value.startsWith('directus_'), {
		message: 'Collection names may not start with directus_',
	})

export const coolifyEnvironmentSchema = z.object({
	COOLIFY_DEPLOYMENTS_ENABLED: z.boolean().default(true),
	COOLIFY_APPLICATIONS_COLLECTION: collectionNameSchema.default('coolify_applications'),
	COOLIFY_URL: z.url(),
	COOLIFY_TOKEN: z.string().trim().min(1),
})

export const envSchema = coolifyEnvironmentSchema

export const coolifyProjectSchema = z
	.object({
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

const coolifyApplicationEnvironmentSchema = z
	.object({
		uuid: z.string().trim().min(1).nullable().optional(),
		name: z.string().nullable().optional(),
		project_uuid: z.string().trim().min(1).nullable().optional(),
		project_name: z.string().nullable().optional(),
		project: z
			.object({
				uuid: z.string().trim().min(1).nullable().optional(),
				name: z.string().nullable().optional(),
			})
			.loose()
			.nullable()
			.optional(),
	})
	.loose()
	.nullable()
	.optional()

export const coolifyApplicationSchema = z
	.object({
		uuid: z.string().trim().min(1),
		name: z.string(),
		fqdn: z.string().nullable().optional(),
		status: z.string().nullable().optional(),
		environment_id: z.number().int().nullable().optional(),
		environment_uuid: z.string().trim().min(1).nullable().optional(),
		environment_name: z.string().nullable().optional(),
		project_uuid: z.string().trim().min(1).nullable().optional(),
		project_name: z.string().nullable().optional(),
		environment: coolifyApplicationEnvironmentSchema,
		git_branch: z.string().nullable().optional(),
		git_commit_sha: z.string().nullable().optional(),
		git_repository: z.string().nullable().optional(),
		build_pack: z.string().nullable().optional(),
		destination: z
			.object({
				server: z
					.object({ name: z.string().nullable().optional() })
					.loose()
					.nullable()
					.optional(),
			})
			.loose()
			.nullable()
			.optional(),
	})
	.loose()
	.transform((application) => ({
		uuid: application.uuid,
		name: application.name,
		fqdn: application.fqdn ?? null,
		status: application.status ?? null,
		environmentId: application.environment_id ?? null,
		environmentUuid: application.environment_uuid ?? application.environment?.uuid ?? null,
		environmentName: application.environment_name ?? application.environment?.name ?? null,
		projectUuid:
			application.project_uuid ??
			application.environment?.project_uuid ??
			application.environment?.project?.uuid ??
			null,
		projectName:
			application.project_name ??
			application.environment?.project_name ??
			application.environment?.project?.name ??
			null,
		gitBranch: application.git_branch ?? null,
		gitCommitSha: application.git_commit_sha ?? null,
		gitRepository: application.git_repository ?? null,
		buildPack: application.build_pack ?? null,
		serverName: application.destination?.server?.name ?? null,
	}))
export const coolifyApplicationsResponseSchema = z.array(coolifyApplicationSchema)

export const coolifyDeploymentSchema = z
	.object({
		id: z.number().int().nullable().optional(),
		application: z
			.object({ uuid: z.string().trim().min(1) })
			.nullable()
			.optional(),
		application_id: z.string().trim().min(1),
		deployment_uuid: z.string().trim().min(1),
		pull_request_id: z.number().int().nullable().optional(),
		force_rebuild: z.boolean().nullable().optional(),
		commit: z.string().nullable().optional(),
		status: z.string().trim().min(1),
		created_at: z.string().nullable().optional(),
		updated_at: z.string().nullable().optional(),
		finished_at: z.string().nullable().optional(),
		deployment_url: z.string().nullable().optional(),
		commit_message: z.string().nullable().optional(),
	})
	.loose()
	.transform((deployment) => ({
		id: deployment.id ?? null,
		applicationId: deployment.application_id,
		applicationUuid: deployment.application?.uuid ?? null,
		deploymentUuid: deployment.deployment_uuid,
		pullRequestId: deployment.pull_request_id ?? null,
		forceRebuild: deployment.force_rebuild ?? null,
		commit: deployment.commit ?? null,
		status: deployment.status,
		createdAt: deployment.created_at ?? null,
		updatedAt: deployment.updated_at ?? null,
		finishedAt: deployment.finished_at ?? null,
		deploymentUrl: deployment.deployment_url ?? null,
		commitMessage: deployment.commit_message ?? null,
	}))

export const coolifyDeploymentsResponseSchema = z.object({
	count: z.number().int().nonnegative(),
	deployments: z.array(coolifyDeploymentSchema),
})

export const coolifyDeploymentsListSchema = z.array(coolifyDeploymentSchema)

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
