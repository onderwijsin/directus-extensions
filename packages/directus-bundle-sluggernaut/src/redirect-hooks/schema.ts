import type { Field, Relation, Collection } from '@directus/types';

export const collectionSchema = {
	meta: {
		collection: "redirects",
		icon: "route",
		note: 'Stores redirects for changed slugs',
		display_template: '{{origin}} → {{destination}}',
		accountability: 'all',
		singleton: false,
		hidden: false
	},
	schema: {
		schema: "public",
		name: 'redirects',
		comment: null
	}
} as Collection

export const fieldSchema = [
	{
		"collection": "redirects",
		"field": "id",
		"type": "uuid",
		"schema": {
			"name": "id",
			"table": "redirects",
			"data_type": "uuid",
			"default_value": null,
			"generation_expression": null,
			"max_length": null,
			"numeric_precision": null,
			"numeric_scale": null,
			"is_generated": false,
			"is_nullable": false,
			"is_unique": true,
			"is_indexed": false,
			"is_primary_key": true,
		},
		"meta": {
			"collection": "redirects",
			"field": "id",
			"special": [
				"uuid"
			],
			"interface": "input",
			"readonly": true,
			"hidden": true,
			"sort": 1,
			"width": "full",
		}
	},
	{
		"collection": "redirects",
		"field": "user_created",
		"type": "uuid",
		"schema": {
			"name": "user_created",
			"table": "redirects",
			"data_type": "uuid",
			"default_value": null,
			"is_nullable": true,
			"foreign_key_table": "directus_users",
			"foreign_key_column": "id",
		},
		"meta": {
			"collection": "redirects",
			"field": "user_created",
			"special": [
				"user-created"
			],
			"interface": "select-dropdown-m2o",
			"options": {
				"template": "{{avatar}} {{first_name}} {{last_name}}",
				"enableCreate": false,
				"enableSelect": false
			},
			"display": "user",
			"readonly": true,
			"sort": 9,
			"width": "half",
		}
	},
	{
		"collection": "redirects",
		"field": "date_created",
		"type": "timestamp",
		"schema": {
			"name": "date_created",
			"table": "redirects",
			"data_type": "timestamp with time zone",
			"default_value": null,
			"is_nullable": true,
		},
		"meta": {
			"collection": "redirects",
			"field": "date_created",
			"special": [
				"date-created"
			],
			"interface": "datetime",
			"options": null,
			"display": "datetime",
			"display_options": {
				"relative": true
			},
			"readonly": true,
			"sort": 10,
			"width": "half",
		}
	},
	{
		"collection": "redirects",
		"field": "user_updated",
		"type": "uuid",
		"schema": {
			"name": "user_updated",
			"table": "redirects",
			"data_type": "uuid",
			"default_value": null,
			"is_nullable": true,
			"foreign_key_table": "directus_users",
			"foreign_key_column": "id",
		},
		"meta": {
			"collection": "redirects",
			"field": "user_updated",
			"special": [
				"user-updated"
			],
			"interface": "select-dropdown-m2o",
			"options": {
				"template": "{{avatar}} {{first_name}} {{last_name}}",
				"enableCreate": false,
				"enableSelect": false
			},
			"display": "user",
			"readonly": true,
			"sort": 11,
			"width": "half",
		}
	},
	{
		"collection": "redirects",
		"field": "date_updated",
		"type": "timestamp",
		"schema": {
			"name": "date_updated",
			"table": "redirects",
			"data_type": "timestamp with time zone",
			"default_value": null,
			"is_nullable": true,
		},
		"meta": {
			"collection": "redirects",
			"field": "date_updated",
			"special": [
				"date-updated"
			],
			"interface": "datetime",
			"display": "datetime",
			"display_options": {
				"relative": true
			},
			"readonly": true,
			"sort": 12,
			"width": "half",
		}
	},
	{
		"collection": "redirects",
		"field": "origin",
		"type": "string",
		"schema": {
			"name": "origin",
			"table": "redirects",
			"data_type": "character varying",
			"default_value": null,
			"max_length": 255,
			"is_nullable": false,
		},
		"meta": {
			"collection": "redirects",
			"field": "origin",
			"special": null,
			"interface": "input",
			"options": {
				"trim": true
			},
			"sort": 2,
			"width": "full",
			"note": "Use a relative path like \"/contact-old\"",
		}
	},
	{
		"collection": "redirects",
		"field": "destination",
		"type": "string",
		"schema": {
			"name": "destination",
			"table": "redirects",
			"data_type": "character varying",
			"default_value": null,
			"max_length": 255,
			"is_nullable": false,
		},
		"meta": {
			"collection": "redirects",
			"field": "destination",
			"interface": "input",
			"options": {
				"trim": true
			},
			"sort": 3,
			"width": "full",
			"note": "Use a relative path like \"/contact-new\", or a URL for external redirects",
			"required": true,
		}
	},
	{
		"collection": "redirects",
		"field": "type",
		"type": "integer",
		"schema": {
			"name": "type",
			"table": "redirects",
			"data_type": "integer",
			"default_value": 302,
			"numeric_precision": 32,
			"numeric_scale": 0,
			"is_nullable": false,
		},
		"meta": {
			"collection": "redirects",
			"field": "type",
			"interface": "select-dropdown",
			"options": {
				"choices": [
					{
						"text": "301 (permanent)",
						"value": "301"
					},
					{
						"text": "302 (tijdelijk)",
						"value": 302
					}
				]
			},
			"sort": 4,
			"width": "full",
			"required": true,
		}
	},
	{
		"collection": "redirects",
		"field": "is_active",
		"type": "boolean",
		"schema": {
			"name": "is_active",
			"table": "redirects",
			"data_type": "boolean",
			"default_value": true,
			"is_nullable": false,
		},
		"meta": {
			"collection": "redirects",
			"field": "is_active",
			"special": [
				"cast-boolean"
			],
			"interface": "boolean",
			"sort": 5,
			"width": "full",
			"note": "Inactive redirect are never used, even if a start date is set",
		}
	},
	{
		"collection": "redirects",
		"field": "start_date",
		"type": "dateTime",
		"schema": {
			"name": "start_date",
			"table": "redirects",
			"data_type": "timestamp without time zone",
			"default_value": null,
			"is_nullable": true,
		},
		"meta": {
			"collection": "redirects",
			"field": "start_date",
			"interface": "datetime",
			"sort": 6,
			"width": "half",
		}
	},
	{
		"collection": "redirects",
		"field": "end_date",
		"type": "dateTime",
		"schema": {
			"name": "end_date",
			"table": "redirects",
			"data_type": "timestamp without time zone",
			"default_value": null,
			"is_nullable": true
		},
		"meta": {
			"collection": "redirects",
			"field": "end_date",
			"interface": "datetime",
			"sort": 7,
			"width": "half",
		}
	},
	{
		"collection": "redirects",
		"field": "divider-hxkm8n",
		"type": "alias",
		"schema": null,
		"meta": {
			"collection": "redirects",
			"field": "divider-hxkm8n",
			"special": [
				"alias",
				"no-data"
			],
			"interface": "presentation-divider",
			"options": {
				"title": "Activity"
			},
			"sort": 8,
			"width": "full",
		}
	}
] as unknown as Field[]

export const relationSchema = [
	{
		"collection": "redirects",
		"field": "user_updated",
		"related_collection": "directus_users",
		"schema": {
			"constraint_name": "redirects_user_updated_foreign",
			"table": "redirects",
			"column": "user_updated",
			"foreign_key_table": "directus_users",
			"foreign_key_column": "id",
			"on_update": "NO ACTION",
			"on_delete": "NO ACTION"
		},
		"meta": {
			"many_collection": "redirects",
			"many_field": "user_updated",
			"one_collection": "directus_users",
			"one_deselect_action": "nullify"
		}
	},
	{
		"collection": "redirects",
		"field": "user_created",
		"related_collection": "directus_users",
		"schema": {
			"constraint_name": "redirects_user_created_foreign",
			"table": "redirects",
			"column": "user_created",
			"foreign_key_table": "directus_users",
			"foreign_key_column": "id",
			"on_update": "NO ACTION",
			"on_delete": "NO ACTION"
		},
		"meta": {
			"many_collection": "redirects",
			"many_field": "user_created",
			"one_collection": "directus_users",
			"one_deselect_action": "nullify"
		}
	}
] as Relation[]

export const settingsFieldSchema = [
	{
		"collection": "directus_settings",
		"field": "use_namespace",
		"type": "boolean",
		"schema": {
			"name": "use_namespace",
			"table": "directus_settings",
			"data_type": "boolean",
			"default_value": false,
			"is_nullable": false,
		},
		"meta": {
			"collection": "directus_settings",
			"field": "use_namespace",
			"special": [
				"cast-boolean"
			],
			"interface": "boolean",
			"sort": 3,
			"width": "half",
			"note": "Whether to use collection namespace in redirects",
		}
	},
	{
		"collection": "directus_settings",
		"field": "use_trailing_slash",
		"type": "boolean",
		"schema": {
			"name": "use_trailing_slash",
			"table": "directus_settings",
			"data_type": "boolean",
			"default_value": false,
			"is_nullable": false,
		},
		"meta": {
			"collection": "directus_settings",
			"field": "use_trailing_slash",
			"special": [
				"cast-boolean"
			],
			"interface": "boolean",
			"sort": 4,
			"width": "half",
			"note": "Whether to use a trailing slash in both origin and destination",
			"required": true,
		}
	},
	{
		"collection": "directus_settings",
		"field": "divider_redirects",
		"type": "alias",
		"schema": null,
		"meta": {
			"id": 165,
			"collection": "directus_settings",
			"field": "divider_redirects",
			"special": [
				"alias",
				"no-data"
			],
			"interface": "presentation-divider",
			"options": {
				"icon": "route",
				"title": "Redirects"
			},
			"sort": 1,
			"width": "full",
		}
	}
] as unknown as Field[]

export const namespaceFieldSchema = [{
	"collection": "directus_collections",
	"field": "namespace",
	"type": "string",
	"schema": {
		"name": "namespace",
		"table": "directus_collections",
		"data_type": "character varying",
		"max_length": 255,
		"is_nullable": true,
	},
	"meta": {
		"collection": "directus_collections",
		"field": "namespace",
		"interface": "input",
		"options": {
			"placeholder": "Add a namespace for this collection"
		},
		"sort": 1,
		"width": "full",
		"note": "The namespace will be used when creating redirects",
	}
}] as unknown as Field[]
