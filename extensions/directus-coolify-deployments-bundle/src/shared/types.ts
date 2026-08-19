export const DEPLOYMENT_STATUSES = [
	'queued',
	'running',
	'success',
	'failed',
	'cancelled',
	'unknown',
] as const

export type DeploymentStatus = (typeof DEPLOYMENT_STATUSES)[number]

export interface CoolifyProject {
	id: string
	name: string
	productionUrl: string | null
	resourceUuid: string
}

export interface DeploymentPagination {
	skip: number
	take: number
}

export interface PublicCoolifyProject {
	id: string
	name: string
	productionUrl: string | null
}

export interface NormalizedDeployment {
	id: string
	projectId: string
	status: DeploymentStatus
	rawStatus: string
	commitSha: string | null
	commitMessage: string | null
	deploymentUrl: string | null
	startedAt: string | null
	finishedAt: string | null
	duration: number | null
}
