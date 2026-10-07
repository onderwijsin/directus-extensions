import type { InjectionKey } from 'vue'
import type { ApplicationSummary } from '../types'

import { inject, provide, shallowReadonly, shallowRef } from 'vue'

const navigationKey: InjectionKey<ReturnType<typeof createApplicationNavigation>> = Symbol(
	'coolify-application-navigation',
)

/**
 * Create application navigation state for one mounted Deployments module.
 * @param listApplications - Authenticated application loader.
 * @returns Shared application state and explicit loading/update actions.
 */
export function createApplicationNavigation(listApplications: () => Promise<ApplicationSummary[]>) {
	const applications = shallowRef<ApplicationSummary[]>([])
	let loaded = false
	let pending: Promise<void> | undefined
	let revision = 0

	/**
	 * Replace navigation from a fresh dashboard or application response.
	 * @param nextApplications - Current configured applications.
	 * @returns Nothing.
	 */
	const updateApplications = (nextApplications: ApplicationSummary[]) => {
		applications.value = nextApplications
		loaded = true
		revision += 1
	}

	/**
	 * Load navigation only when it has not already been populated.
	 * @returns Completion of the shared request, or immediate completion for loaded state.
	 */
	const ensureApplications = async (): Promise<void> => {
		if (loaded) return
		if (pending) return pending
		const requestedRevision = revision
		pending = (async () => {
			try {
				const nextApplications = await listApplications()
				if (requestedRevision === revision) updateApplications(nextApplications)
			} finally {
				pending = undefined
			}
		})()
		return pending
	}

	return { applications: shallowReadonly(applications), updateApplications, ensureApplications }
}

/**
 * Provide navigation state from the module's persistent parent route.
 * @param listApplications - Authenticated application loader.
 * @returns Nothing.
 */
export function provideApplicationNavigation(
	listApplications: () => Promise<ApplicationSummary[]>,
) {
	provide(navigationKey, createApplicationNavigation(listApplications))
}

/**
 * Consume the navigation shared by the current module routes.
 * @returns Shared application state and loading/update actions.
 */
export function useApplicationNavigation() {
	const navigation = inject(navigationKey)
	if (!navigation)
		throw new Error('Application navigation requires the Deployments module parent')
	return navigation
}
