import type { FieldRaw, Relation, Collection } from '@directus/types';

export const collectionSchema = {
	meta: {
		collection: "redirects",
		icon: "route",
		note: 'Stores redirects for changed slugs',
		display_template: '{{origin}} → {{destination}}',
		color: "#A2B5CD",
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
			"has_auto_increment": false,
			"foreign_key_schema": null,
			"foreign_key_table": null,
			"foreign_key_column": null,
			"comment": null
		},
		"meta": {
			"collection": "redirects",
			"field": "id",
			"special": [
				"uuid"
			],
			"interface": "input",
			"options": null,
			"display": null,
			"display_options": null,
			"readonly": true,
			"hidden": true,
			"sort": 1,
			"width": "full",
			"translations": null,
			"note": null,
			"conditions": null,
			"required": false,
			"group": null,
			"validation": null,
			"validation_message": null
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
			"generation_expression": null,
			"max_length": null,
			"numeric_precision": null,
			"numeric_scale": null,
			"is_generated": false,
			"is_nullable": true,
			"is_unique": false,
			"is_indexed": false,
			"is_primary_key": false,
			"has_auto_increment": false,
			"foreign_key_schema": "public",
			"foreign_key_table": "directus_users",
			"foreign_key_column": "id",
			"comment": null
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
			"display_options": null,
			"readonly": true,
			"hidden": false,
			"sort": 9,
			"width": "half",
			"translations": null,
			"note": null,
			"conditions": null,
			"required": false,
			"group": null,
			"validation": null,
			"validation_message": null
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
			"generation_expression": null,
			"max_length": null,
			"numeric_precision": null,
			"numeric_scale": null,
			"is_generated": false,
			"is_nullable": true,
			"is_unique": false,
			"is_indexed": false,
			"is_primary_key": false,
			"has_auto_increment": false,
			"foreign_key_schema": null,
			"foreign_key_table": null,
			"foreign_key_column": null,
			"comment": null
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
			"hidden": false,
			"sort": 10,
			"width": "half",
			"translations": null,
			"note": null,
			"conditions": null,
			"required": false,
			"group": null,
			"validation": null,
			"validation_message": null
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
			"generation_expression": null,
			"max_length": null,
			"numeric_precision": null,
			"numeric_scale": null,
			"is_generated": false,
			"is_nullable": true,
			"is_unique": false,
			"is_indexed": false,
			"is_primary_key": false,
			"has_auto_increment": false,
			"foreign_key_schema": "public",
			"foreign_key_table": "directus_users",
			"foreign_key_column": "id",
			"comment": null
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
			"display_options": null,
			"readonly": true,
			"hidden": false,
			"sort": 11,
			"width": "half",
			"translations": null,
			"note": null,
			"conditions": null,
			"required": false,
			"group": null,
			"validation": null,
			"validation_message": null
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
			"generation_expression": null,
			"max_length": null,
			"numeric_precision": null,
			"numeric_scale": null,
			"is_generated": false,
			"is_nullable": true,
			"is_unique": false,
			"is_indexed": false,
			"is_primary_key": false,
			"has_auto_increment": false,
			"foreign_key_schema": null,
			"foreign_key_table": null,
			"foreign_key_column": null,
			"comment": null
		},
		"meta": {
			"collection": "redirects",
			"field": "date_updated",
			"special": [
				"date-updated"
			],
			"interface": "datetime",
			"options": null,
			"display": "datetime",
			"display_options": {
				"relative": true
			},
			"readonly": true,
			"hidden": false,
			"sort": 12,
			"width": "half",
			"translations": null,
			"note": null,
			"conditions": null,
			"required": false,
			"group": null,
			"validation": null,
			"validation_message": null
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
			"generation_expression": null,
			"max_length": 255,
			"numeric_precision": null,
			"numeric_scale": null,
			"is_generated": false,
			"is_nullable": false,
			"is_unique": false,
			"is_indexed": false,
			"is_primary_key": false,
			"has_auto_increment": false,
			"foreign_key_schema": null,
			"foreign_key_table": null,
			"foreign_key_column": null,
			"comment": null
		},
		"meta": {
			"collection": "redirects",
			"field": "origin",
			"special": null,
			"interface": "input",
			"options": {
				"trim": true
			},
			"display": null,
			"display_options": null,
			"readonly": false,
			"hidden": false,
			"sort": 2,
			"width": "full",
			"translations": null,
			"note": "Gebruik een relatief pad, zoals \"/contact-oud\"",
			"conditions": null,
			"required": true,
			"group": null,
			"validation": null,
			"validation_message": null
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
			"generation_expression": null,
			"max_length": 255,
			"numeric_precision": null,
			"numeric_scale": null,
			"is_generated": false,
			"is_nullable": false,
			"is_unique": false,
			"is_indexed": false,
			"is_primary_key": false,
			"has_auto_increment": false,
			"foreign_key_schema": null,
			"foreign_key_table": null,
			"foreign_key_column": null,
			"comment": null
		},
		"meta": {
			"collection": "redirects",
			"field": "destination",
			"special": null,
			"interface": "input",
			"options": {
				"trim": true
			},
			"display": null,
			"display_options": null,
			"readonly": false,
			"hidden": false,
			"sort": 3,
			"width": "full",
			"translations": null,
			"note": "Gebruik een relatief pad, zoals \"/contact-nieuw\", of een URL voor een externe redirect",
			"conditions": null,
			"required": true,
			"group": null,
			"validation": null,
			"validation_message": null
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
			"generation_expression": null,
			"max_length": null,
			"numeric_precision": 32,
			"numeric_scale": 0,
			"is_generated": false,
			"is_nullable": false,
			"is_unique": false,
			"is_indexed": false,
			"is_primary_key": false,
			"has_auto_increment": false,
			"foreign_key_schema": null,
			"foreign_key_table": null,
			"foreign_key_column": null,
			"comment": null
		},
		"meta": {
			"collection": "redirects",
			"field": "type",
			"special": null,
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
			"display": null,
			"display_options": null,
			"readonly": false,
			"hidden": false,
			"sort": 4,
			"width": "full",
			"translations": null,
			"note": null,
			"conditions": null,
			"required": true,
			"group": null,
			"validation": null,
			"validation_message": null
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
			"generation_expression": null,
			"max_length": null,
			"numeric_precision": null,
			"numeric_scale": null,
			"is_generated": false,
			"is_nullable": false,
			"is_unique": false,
			"is_indexed": false,
			"is_primary_key": false,
			"has_auto_increment": false,
			"foreign_key_schema": null,
			"foreign_key_table": null,
			"foreign_key_column": null,
			"comment": null
		},
		"meta": {
			"collection": "redirects",
			"field": "is_active",
			"special": [
				"cast-boolean"
			],
			"interface": "boolean",
			"options": null,
			"display": null,
			"display_options": null,
			"readonly": false,
			"hidden": false,
			"sort": 5,
			"width": "full",
			"translations": null,
			"note": "Redirects die niet zijn ingeschakeld worden nooit gebruikt, ook niet als je een start en einddatum hebt gekozen",
			"conditions": null,
			"required": false,
			"group": null,
			"validation": null,
			"validation_message": null
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
			"generation_expression": null,
			"max_length": null,
			"numeric_precision": null,
			"numeric_scale": null,
			"is_generated": false,
			"is_nullable": true,
			"is_unique": false,
			"is_indexed": false,
			"is_primary_key": false,
			"has_auto_increment": false,
			"foreign_key_schema": null,
			"foreign_key_table": null,
			"foreign_key_column": null,
			"comment": null
		},
		"meta": {
			"collection": "redirects",
			"field": "start_date",
			"special": null,
			"interface": "datetime",
			"options": null,
			"display": null,
			"display_options": null,
			"readonly": false,
			"hidden": false,
			"sort": 6,
			"width": "half",
			"translations": null,
			"note": null,
			"conditions": null,
			"required": false,
			"group": null,
			"validation": null,
			"validation_message": null
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
			"generation_expression": null,
			"max_length": null,
			"numeric_precision": null,
			"numeric_scale": null,
			"is_generated": false,
			"is_nullable": true,
			"is_unique": false,
			"is_indexed": false,
			"is_primary_key": false,
			"has_auto_increment": false,
			"foreign_key_schema": null,
			"foreign_key_table": null,
			"foreign_key_column": null,
			"comment": null
		},
		"meta": {
			"collection": "redirects",
			"field": "end_date",
			"special": null,
			"interface": "datetime",
			"options": null,
			"display": null,
			"display_options": null,
			"readonly": false,
			"hidden": false,
			"sort": 7,
			"width": "half",
			"translations": null,
			"note": null,
			"conditions": null,
			"required": false,
			"group": null,
			"validation": null,
			"validation_message": null
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
			"display": null,
			"display_options": null,
			"readonly": false,
			"hidden": false,
			"sort": 8,
			"width": "full",
			"translations": null,
			"note": null,
			"conditions": null,
			"required": false,
			"group": null,
			"validation": null,
			"validation_message": null
		}
	}
] as FieldRaw[]

export const relationSchema = [
	{
		"collection": "redirects",
		"field": "user_updated",
		"related_collection": "directus_users",
		"schema": {
			"constraint_name": "redirects_user_updated_foreign",
			"table": "redirects",
			"column": "user_updated",
			"foreign_key_schema": "public",
			"foreign_key_table": "directus_users",
			"foreign_key_column": "id",
			"on_update": "NO ACTION",
			"on_delete": "NO ACTION"
		},
		"meta": {
			"many_collection": "redirects",
			"many_field": "user_updated",
			"one_collection": "directus_users",
			"one_field": null,
			"one_collection_field": null,
			"one_allowed_collections": null,
			"junction_field": null,
			"sort_field": null,
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
			"foreign_key_schema": "public",
			"foreign_key_table": "directus_users",
			"foreign_key_column": "id",
			"on_update": "NO ACTION",
			"on_delete": "NO ACTION"
		},
		"meta": {
			"many_collection": "redirects",
			"many_field": "user_created",
			"one_collection": "directus_users",
			"one_field": null,
			"one_collection_field": null,
			"one_allowed_collections": null,
			"junction_field": null,
			"sort_field": null,
			"one_deselect_action": "nullify"
		}
	}
] as Relation[]

export const settingSchema = [
	{
		"collection": "directus_settings",
		"field": "use_namespace",
		"type": "boolean",
		"schema": {
			"name": "use_namespace",
			"table": "directus_settings",
			"data_type": "boolean",
			"default_value": false,
			"generation_expression": null,
			"max_length": null,
			"numeric_precision": null,
			"numeric_scale": null,
			"is_generated": false,
			"is_nullable": false,
			"is_unique": false,
			"is_indexed": false,
			"is_primary_key": false,
			"has_auto_increment": false,
			"foreign_key_schema": null,
			"foreign_key_table": null,
			"foreign_key_column": null,
			"comment": null
		},
		"meta": {
			"collection": "directus_settings",
			"field": "use_namespace",
			"special": [
				"cast-boolean"
			],
			"interface": "boolean",
			"options": null,
			"display": null,
			"display_options": null,
			"readonly": false,
			"hidden": false,
			"sort": 3,
			"width": "half",
			"translations": null,
			"note": "Whether to use collection namespace in redirects",
			"conditions": null,
			"required": false,
			"group": null,
			"validation": null,
			"validation_message": null
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
			"generation_expression": null,
			"max_length": null,
			"numeric_precision": null,
			"numeric_scale": null,
			"is_generated": false,
			"is_nullable": false,
			"is_unique": false,
			"is_indexed": false,
			"is_primary_key": false,
			"has_auto_increment": false,
			"foreign_key_schema": null,
			"foreign_key_table": null,
			"foreign_key_column": null,
			"comment": null
		},
		"meta": {
			"collection": "directus_settings",
			"field": "use_trailing_slash",
			"special": [
				"cast-boolean"
			],
			"interface": "boolean",
			"options": null,
			"display": null,
			"display_options": null,
			"readonly": false,
			"hidden": false,
			"sort": 4,
			"width": "half",
			"translations": null,
			"note": "Whether to use a trailing slash in both origin and destination",
			"conditions": null,
			"required": true,
			"group": null,
			"validation": null,
			"validation_message": null
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
			"display": null,
			"display_options": null,
			"readonly": false,
			"hidden": false,
			"sort": 1,
			"width": "full",
			"translations": null,
			"note": null,
			"conditions": null,
			"required": false,
			"group": null,
			"validation": null,
			"validation_message": null
		}
	}
] as FieldRaw[]

export const namespaceFieldSchema = {
	"collection": "directus_collections",
	"field": "namespace",
	"type": "string",
	"schema": {
		"name": "namespace",
		"table": "directus_collections",
		"data_type": "character varying",
		"default_value": null,
		"generation_expression": null,
		"max_length": 255,
		"numeric_precision": null,
		"numeric_scale": null,
		"is_generated": false,
		"is_nullable": true,
		"is_unique": false,
		"is_indexed": false,
		"is_primary_key": false,
		"has_auto_increment": false,
		"foreign_key_schema": null,
		"foreign_key_table": null,
		"foreign_key_column": null,
		"comment": null
	},
	"meta": {
		"collection": "directus_collections",
		"field": "namespace",
		"special": null,
		"interface": "input",
		"options": {
			"placeholder": "Add a namespace for this collection"
		},
		"display": null,
		"display_options": null,
		"readonly": false,
		"hidden": false,
		"sort": 1,
		"width": "full",
		"translations": null,
		"note": "The namespace will be used when creating redirects",
		"conditions": null,
		"required": false,
		"group": null,
		"validation": null,
		"validation_message": null
	}
} as unknown as FieldRaw
