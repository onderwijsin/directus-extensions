import type {
	CoolifyApplication,
	CoolifyApplicationFilter,
	CoolifyDeployment,
	CoolifyDeploymentCancellationResult,
	CoolifyDeploymentRequest,
	CoolifyDeploymentTriggerResult,
	CoolifyEnvironment,
	CoolifyProject,
} from './schemas'

export interface DirectusCoolifyApplication {
	id: string
	name: string
	application_uuid: string
	project_uuid: string | null
	project_name: string | null
	environment_uuid: string | null
	environment_name: string | null
	production_url: string | null
	enabled: boolean
	deploy_enabled: boolean
}

export type {
	ConfiguredCoolifyApplication,
	CoolifyApplication,
	CoolifyApplicationFilter,
	CoolifyDeployment,
	CoolifyDeploymentCancellationResult,
	CoolifyDeploymentRequest,
	CoolifyDeploymentTriggerResult,
	CoolifyEnvironment,
	CoolifyProject,
	CoolifyDeploymentsOptions,
} from './schemas'

export interface CoolifyClientContext {
	services: ApiExtensionContext['services']
	getSchema: ApiExtensionContext['getSchema']
	cacheEnabled: boolean
	cacheStore: 'redis' | 'memory'
	redis?: string
}

export interface CoolifyDeploymentClient {
	listConfiguredApplication: () => Promise<DirectusCoolifyApplication[]>
	getAllowedApplications: () => Promise<string[]>
	getAllowedProjects: () => Promise<string[]>
	getAllowedEnvirnoments: () => Promise<string[]>
	listProjects: () => Promise<CoolifyProject[]>
	getProject: (projectUuid: string) => Promise<CoolifyProject>
	listEnvironments: (projectUuid: string) => Promise<CoolifyEnvironment[]>
	getEnvironment: (
		projectUuid: string,
		environmentUuidOrName: string,
	) => Promise<CoolifyEnvironment>
	listApplications: (filter?: CoolifyApplicationFilter) => Promise<CoolifyApplication[]>
	getApplication: (applicationUuid: string) => Promise<CoolifyApplication>
	listApplicationDeployments: (applicationUuid: string) => Promise<CoolifyDeployment[]>
	listRunningDeployments: () => Promise<CoolifyDeployment[]>
	getDeployment: (deploymentUuid: string) => Promise<CoolifyDeployment>
	deploy: (input: CoolifyDeploymentRequest) => Promise<CoolifyDeploymentTriggerResult[]>
	cancelDeployment: (deploymentUuid: string) => Promise<CoolifyDeploymentCancellationResult>
}
import type { ApiExtensionContext } from '@directus/types'
