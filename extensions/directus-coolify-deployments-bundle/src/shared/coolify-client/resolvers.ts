import type { DirectusCoolifyApplication } from './types'

type ListConfiguredApplication = () => Promise<DirectusCoolifyApplication[]>

/**
 * @param values - UUID values that may contain nulls or duplicates.
 * @returns Unique non-empty UUID values.
 */
const unique = (values: (string | null)[]): string[] => [
	...new Set(values.filter((value): value is string => value !== null && value.length > 0)),
]

/**
 * @param listConfiguredApplication - Loader for allow-listed Directus applications.
 * @returns Unique allowed Coolify application UUIDs.
 */
export async function getAllowedApplications(
	listConfiguredApplication: ListConfiguredApplication,
): Promise<string[]> {
	const applications = await listConfiguredApplication()
	return unique(applications.map(({ application_uuid }) => application_uuid))
}

/**
 * @param listConfiguredApplication - Loader for allow-listed Directus applications.
 * @returns Unique allowed Coolify project UUIDs.
 */
export async function getAllowedProjects(
	listConfiguredApplication: ListConfiguredApplication,
): Promise<string[]> {
	const applications = await listConfiguredApplication()
	return unique(applications.map(({ project_uuid }) => project_uuid))
}

/**
 * @param listConfiguredApplication - Loader for allow-listed Directus applications.
 * @returns Unique allowed Coolify environment UUIDs.
 */
export async function getAllowedEnvironments(
	listConfiguredApplication: ListConfiguredApplication,
): Promise<string[]> {
	const applications = await listConfiguredApplication()
	return unique(applications.map(({ environment_uuid }) => environment_uuid))
}
