import type { SystemCollectionConfig } from './config.schema'

/**
 * An array defining the explicit order of system Directus collections.
 * Determines which system collections are included during seeding and extraction processes
 * and in what order they should be processed.
 *
 * This is generally the best order for directus system tables:
 *  - directus_policies
 *  - directus_roles
 *  - directus_users
 *  - directus_access
 *  - directus_presets
 *  - directus_permissions
 *  - directus_folders
 *  - directus_files
 *  - directus_dashboards
 *  - directus_panels
 *  - directus_flows
 *  - directus_operations
 *  - directus_settings
 *  - directus_translations
 *
 * Filter can be defined to limit the data extracted for a collection.
 * Fields can be defined to limit the fields extracted for a collection.
 */
export const SYSTEM_COLLECTIONS: SystemCollectionConfig[] = [
	{
		collection: 'directus_policies',
		operationMode: 'full-idempotent',
		management: { type: 'manifest' },
		filter: null,
		fields: [
			'id',
			'name',
			'icon',
			'description',
			'ip_access',
			'enforce_tfa',
			'admin_access',
			'app_access',
		],
	},
	{
		collection: 'directus_roles',
		operationMode: 'full-idempotent',
		management: { type: 'manifest' },
		filter: null,
		fields: ['id', 'name', 'icon', 'description', 'parent'],
	},
	{
		collection: 'directus_users',
		operationMode: 'full-idempotent',
		management: { type: 'manifest' },
		filter: null,
		// Include all user properties we need for a working system
		fields: [
			'id',
			'avatar',
			'first_name',
			'last_name',
			'title',
			'description',
			'email',
			'password',
			'status',
			'provider',
			'role',
			'email_notifications',
			'tags',
			'language',
		],
	},
	{
		collection: 'directus_access',
		operationMode: 'full-idempotent',
		management: { type: 'manifest' },
		filter: null,
		fields: ['id', 'policy', 'role', 'sort', 'user'],
	},
	{
		collection: 'directus_presets',
		operationMode: 'insert-update',
		filter: { user: { _null: true } },
		sort: ['-role', 'id'],
		fields: [
			'id',
			'bookmark',
			'user',
			'role',
			'collection',
			'search',
			'layout',
			'layout_query',
			'layout_options',
			'refresh_interval',
			'filter',
			'icon',
			'color',
		],
	},
	{
		collection: 'directus_permissions',
		operationMode: 'full-idempotent',
		management: { type: 'relation', field: 'policy', collection: 'directus_policies' },
		filter: null,
		fields: [
			'id',
			'collection',
			'action',
			'permissions',
			'validation',
			'presets',
			'fields',
			'policy',
		],
	},
	{
		collection: 'directus_folders',
		operationMode: 'full-idempotent',
		management: { type: 'manifest' },
		filter: null,
		fields: ['id', 'name', 'parent', 'type'],
		sort: ['-parent'],
	},
	{
		collection: 'directus_files',
		operationMode: 'full-idempotent',
		management: { type: 'manifest' },
		filter: null,
		fields: [
			'id',
			'filename_disk',
			'filename_download',
			'description',
			'title',
			'type',
			'folder',
		],
	},
	{
		collection: 'directus_dashboards',
		operationMode: 'full-idempotent',
		filter: null,
		fields: ['id', 'name', 'note', 'icon', 'color'], // Exclude panels
	},
	{
		collection: 'directus_panels',
		operationMode: 'full-idempotent',
		filter: null,
		fields: [
			'id',
			'dashboard',
			'name',
			'icon',
			'color',
			'show_header',
			'note',
			'type',
			'position_x',
			'position_y',
			'width',
			'height',
			'options',
		],
	},
	{
		collection: 'directus_flows',
		operationMode: 'full-idempotent',
		filter: null,
		fields: [
			'id',
			'name',
			'icon',
			'color',
			'description',
			'status',
			'trigger',
			'accountability',
			'options',
			// We point to the first operation in the flow. This makes sure operations and flows
			// are nicely coupled.
			'operation',
			'folder',
		],
	},
	{
		collection: 'directus_operations',
		operationMode: 'full-idempotent',
		filter: null,
		fields: [
			'id',
			'name',
			'key',
			'type',
			'position_x',
			'position_y',
			'options',
			'resolve',
			'reject',
			// We need to point to a flow for every operation. This is a bit redundant because every
			// flow is already pointing to an operation. But hey, it works!
			'flow',
		],
	},
	{
		collection: 'directus_settings',
		operationMode: 'insert-update',
		filter: null,
		// We get ALL fields for settings: settings change more often than other collections.
		fields: ['*'],
	},
	{
		collection: 'directus_translations',
		operationMode: 'full-idempotent',
		filter: null,
		fields: ['id', 'language', 'key', 'value'],
		sort: ['key', 'language'],
	},
]

/**
 * This variable is used to ensure a consistent loading sequence for system collections
 * within the application, maintaining dependencies and functionality.
 * The order represents the hierarchy or dependency order among various system collections.
 */
export const SYSTEM_COLLECTIONS_ORDER = SYSTEM_COLLECTIONS.map(
	(collectionObj) => collectionObj.collection,
) satisfies string[]
