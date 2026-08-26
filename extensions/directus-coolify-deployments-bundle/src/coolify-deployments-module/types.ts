export type DeploymentStatus = 'queued' | 'building' | 'ready' | 'error' | 'canceled'

export interface DeploymentSummary {
	id: string
	directusApplicationId: string
	coolifyApplicationId: string
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
	applicationName?: string | null
	environmentName?: string | null
}

export interface DeploymentHistoryPage {
	data: DeploymentSummary[]
	meta: {
		offset: number
		limit: number
		total: number
		hasMore: boolean
	}
}

export interface ApplicationSummary {
	directusApplicationId: string
	name: string
	url: string | null
	projectName: string | null
	environmentName: string | null
	state: string | null
	gitBranch: string | null
	gitCommitSha: string | null
	gitRepository: string | null
	buildPack: string | null
	serverName: string | null
	latestDeployment: DeploymentSummary | null
}

export interface DashboardSummary {
	applications: ApplicationSummary[]
	current: DeploymentSummary[]
	recent: DeploymentSummary[]
	canTriggerDeployments: boolean
}
