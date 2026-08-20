import type { ApiExtensionContext } from '@directus/types'
import type { CacheEnv } from '@onderwijsin/directus-extension-utils/server'
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
	CoolifyApplication,
	CoolifyApplicationFilter,
	CoolifyDeployment,
	CoolifyDeploymentCancellationResult,
	CoolifyDeploymentRequest,
	CoolifyDeploymentTriggerResult,
	CoolifyDeploymentsOptions,
	CoolifyEnvironment,
	CoolifyProject,
} from './schemas'

export interface CoolifyClientContext extends CacheEnv {
	services: ApiExtensionContext['services']
	getSchema: ApiExtensionContext['getSchema']
	logger?: ApiExtensionContext['logger']
}

export interface GetApplicationOptions {
	bypassAllowList?: boolean
}

export interface CoolifyDeploymentClient {
	listConfiguredApplication: (options?: {
		bypassCache?: boolean
	}) => Promise<DirectusCoolifyApplication[]>
	getConfiguredApplication: (
		id: string,
		options?: { bypassCache?: boolean },
	) => Promise<DirectusCoolifyApplication>
	getAllowedApplications: () => Promise<string[]>
	getAllowedProjects: () => Promise<string[]>
	getAllowedEnvironments: () => Promise<string[]>
	listProjects: () => Promise<CoolifyProject[]>
	getProject: (projectUuid: string) => Promise<CoolifyProject>
	listEnvironments: (projectUuid: string) => Promise<CoolifyEnvironment[]>
	getEnvironment: (
		projectUuid: string,
		environmentUuidOrName: string,
	) => Promise<CoolifyEnvironment>
	listApplications: (filter?: CoolifyApplicationFilter) => Promise<CoolifyApplication[]>
	getApplication: (
		applicationUuid: string,
		options?: GetApplicationOptions,
	) => Promise<CoolifyApplication>
	listApplicationDeployments: (applicationUuid: string) => Promise<CoolifyDeployment[]>
	listRunningDeployments: () => Promise<CoolifyDeployment[]>
	getDeployment: (deploymentUuid: string) => Promise<CoolifyDeployment>
	deploy: (input: CoolifyDeploymentRequest) => Promise<CoolifyDeploymentTriggerResult[]>
	cancelDeployment: (deploymentUuid: string) => Promise<CoolifyDeploymentCancellationResult>
}
