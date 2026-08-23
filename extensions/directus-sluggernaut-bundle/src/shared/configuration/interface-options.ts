/**
 * Creates the redirect-related options shared by the Sluggernaut interfaces.
 *
 * A factory is used so each Directus interface receives its own option objects.
 * @returns Shared redirect interface option definitions.
 */
export function createRedirectInterfaceOptions() {
	return [
		{
			field: 'automaticRedirects',
			name: 'Automatic redirects',
			type: 'boolean',
			meta: { width: 'half', interface: 'checkbox' },
			schema: { default_value: false },
		},
		{
			field: 'includeUnmanagedRedirectsInPlanning',
			name: 'Include unmanaged redirects in planning',
			type: 'boolean',
			meta: {
				width: 'half',
				interface: 'checkbox',
				note: 'Include redirects not created by Sluggernaut when flattening chains and preventing loops.',
			},
			schema: { default_value: true },
		},
		{
			field: 'unmanagedRedirectConflictBehavior',
			name: 'Unmanaged redirect conflict',
			type: 'string',
			meta: {
				width: 'half',
				interface: 'select-dropdown',
				options: {
					choices: [
						{ text: 'Block', value: 'block' },
						{ text: 'Override', value: 'override' },
					],
				},
				note: 'When an included unmanaged redirect conflicts with the latest canonical value.',
			},
			schema: { default_value: 'override' },
		},
	] as const
}
