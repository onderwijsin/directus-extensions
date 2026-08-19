export type DeploymentStatus = 'queued' | 'building' | 'ready' | 'error' | 'canceled'

export interface DeploymentSummary {
	id: string
	applicationId: string
	status: DeploymentStatus
	rawStatus: string
	createdAt: string | null
	startedAt: string | null
	finishedAt: string | null
	duration: number | null
	branch: string | null
	commitSha: string | null
	commitMessage: string | null
	url: string | null
	coolifyUrl: string | null
	triggeredBy: string | null
}

export interface ApplicationSummary {
	id: string
	name: string
	url: string | null
	projectName: string | null
	latestDeployment: DeploymentSummary | null
}
