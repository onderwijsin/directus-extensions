import { hasKey } from '@onderwijsin/directus-extension-utils'

/**
 * Determine whether Directus accountability has the administrator bypass.
 * @param accountability Authenticated Directus accountability.
 * @returns Whether policy assignment is unnecessary for this request.
 */
export function isEditorAiAdministrator(accountability: object): boolean {
	return (
		(hasKey(accountability, 'admin') && accountability.admin === true) ||
		(hasKey(accountability, 'admin_access') && accountability.admin_access === true)
	)
}
