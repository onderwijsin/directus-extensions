import type { Filter, NestedDeepQuery } from '@directus/types'
import type { CollectionConfig } from '../../lib/config'

interface SystemCollectionConfig extends CollectionConfig {
	filter?: Filter | null
	fields?: string[] | null
	sort?: string[] | null
	deep?: NestedDeepQuery | null
}

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
		filter: null,
		fields: ['id', 'name', 'icon', 'description', 'parent'],
	},
	{
		collection: 'directus_users',
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
		filter: null,
		fields: ['id', 'policy', 'role', 'sort', 'user'],
	},
	{
		collection: 'directus_presets',
		filter: { _and: [{ user: { _null: true } }, { id: { _lt: 50000 } }] },
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
		filter: null,
		fields: ['id', 'name', 'parent', 'type'],
		sort: ['-parent'],
	},
	{
		collection: 'directus_files',
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
		filter: null,
		fields: ['id', 'name', 'note', 'icon', 'color'], // Exclude panels
	},
	{
		collection: 'directus_panels',
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
		filter: null,
		// We get ALL fields for settings: settings change more often than other collections.
		fields: ['*'],
	},
	{
		collection: 'directus_translations',
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
