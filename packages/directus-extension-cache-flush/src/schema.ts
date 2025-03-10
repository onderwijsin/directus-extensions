import type { Collection, Field, Relation } from "@directus/types";

export const collectionSchema = {
	collection: "cache_flush_targets",
	meta: {
		collection: "cache_flush_targets",
		icon: "storage",
		note: "Configuration of targets to sent cache flush requests to",
		display_template: "{{ url }}",
		hidden: false,
		singleton: false,
		archive_field: "status",
		archive_app_filter: true,
		archive_value: "archived",
		unarchive_value: "draft",
		accountability: "all",
		versioning: false
	},
	schema: {
		name: "cache_flush_targets"
	}
} as Collection;

export const junctionSchema = {
	collection: "cache_flush_targets_directus_users",
	meta: {
		collection: "cache_flush_targets_directus_users",
		icon: "import_export",
		hidden: true,
		singleton: false,
		accountability: "all"
	},
	schema: {
		name: "cache_flush_targets_directus_users"
	}
} as Collection;

export const collectionFieldSchema = [
	{
		collection: "cache_flush_targets",
		field: "id",
		type: "uuid",
		schema: {
			name: "id",
			table: "cache_flush_targets",
			default_value: null,
			data_type: "uuid",
			is_nullable: false,
			is_unique: true,
			is_primary_key: true
		},
		meta: {
			collection: "cache_flush_targets",
			field: "id",
			special: [
				"uuid"
			],
			interface: "input",
			readonly: true,
			hidden: true,
			sort: 1,
			width: "full"
		}
	},
	{
		collection: "cache_flush_targets",
		field: "status",
		type: "string",
		schema: {
			name: "status",
			table: "cache_flush_targets",
			data_type: "character varying",
			default_value: "draft",
			is_nullable: false
		},
		meta: {
			collection: "cache_flush_targets",
			field: "status",
			interface: "select-dropdown",
			options: {
				choices: [
					{
						text: "$t:published",
						value: "published",
						color: "var(--theme--primary)"
					},
					{
						text: "$t:draft",
						value: "draft",
						color: "var(--theme--foreground)"
					},
					{
						text: "$t:archived",
						value: "archived",
						color: "var(--theme--warning)"
					}
				]
			},
			display: "labels",
			display_options: {
				showAsDot: true,
				choices: [
					{
						text: "$t:published",
						value: "published",
						color: "var(--theme--primary)",
						foreground: "var(--theme--primary)",
						background: "var(--theme--primary-background)"
					},
					{
						text: "$t:draft",
						value: "draft",
						color: "var(--theme--foreground)",
						foreground: "var(--theme--foreground)",
						background: "var(--theme--background-normal)"
					},
					{
						text: "$t:archived",
						value: "archived",
						color: "var(--theme--warning)",
						foreground: "var(--theme--warning)",
						background: "var(--theme--warning-background)"
					}
				]
			},
			readonly: false,
			hidden: false,
			sort: 2,
			width: "full"
		}
	},
	{
		collection: "cache_flush_targets",
		field: "user_created",
		type: "uuid",
		schema: {
			name: "user_created",
			table: "cache_flush_targets",
			data_type: "uuid",
			is_nullable: true,
			foreign_key_table: "directus_users",
			foreign_key_column: "id"
		},
		meta: {
			collection: "cache_flush_targets",
			field: "user_created",
			special: [
				"user-created"
			],
			interface: "select-dropdown-m2o",
			options: {
				template: "{{avatar}} {{first_name}} {{last_name}}"
			},
			display: "user",
			readonly: true,
			hidden: false,
			sort: 8,
			width: "half"
		}
	},
	{
		collection: "cache_flush_targets",
		field: "date_created",
		type: "timestamp",
		schema: {
			name: "date_created",
			table: "cache_flush_targets",
			data_type: "timestamp with time zone"
		},
		meta: {
			collection: "cache_flush_targets",
			field: "date_created",
			special: [
				"date-created"
			],
			interface: "datetime",
			display: "datetime",
			display_options: {
				relative: true
			},
			readonly: true,
			hidden: false,
			sort: 9,
			width: "half"
		}
	},
	{
		collection: "cache_flush_targets",
		field: "user_updated",
		type: "uuid",
		schema: {
			name: "user_updated",
			table: "cache_flush_targets",
			data_type: "uuid",
			foreign_key_table: "directus_users",
			foreign_key_column: "id"
		},
		meta: {
			collection: "cache_flush_targets",
			field: "user_updated",
			special: [
				"user-updated"
			],
			interface: "select-dropdown-m2o",
			options: {
				template: "{{avatar}} {{first_name}} {{last_name}}"
			},
			display: "user",
			readonly: true,
			hidden: false,
			sort: 10,
			width: "half"
		}
	},
	{
		collection: "cache_flush_targets",
		field: "date_updated",
		type: "timestamp",
		schema: {
			name: "date_updated",
			table: "cache_flush_targets",
			data_type: "timestamp with time zone"
		},
		meta: {
			collection: "cache_flush_targets",
			field: "date_updated",
			special: [
				"date-updated"
			],
			interface: "datetime",
			display: "datetime",
			display_options: {
				relative: true
			},
			readonly: true,
			hidden: false,
			sort: 11,
			width: "half"
		}
	},
	{
		collection: "cache_flush_targets",
		field: "api_key",
		type: "string",
		schema: {
			name: "api_key",
			table: "cache_flush_targets",
			data_type: "character varying",
			is_nullable: true,
			default_value: null
		},
		meta: {
			collection: "cache_flush_targets",
			field: "api_key",
			interface: "input",
			options: {
				placeholder: "Enter remote API key",
				masked: true
			},
			display: "formatted-value",
			display_options: {
				masked: true
			},
			readonly: false,
			hidden: false,
			sort: 5,
			width: "half",
			required: false,
			conditions: [
				{
					name: "visibility",
					rule: {
						_and: [
							{
								auth_header: {
									_eq: "no-auth"
								}
							}
						]
					},
					hidden: true,
					options: {
						font: "sans-serif",
						trim: true,
						masked: true,
						clear: false,
						slug: false
					}
				},
				{
					name: "required",
					rule: {
						_and: [
							{
								auth_header: {
									_neq: "no-auth"
								}
							}
						]
					},
					required: true,
					options: {
						font: "sans-serif",
						trim: true,
						masked: true,
						clear: false,
						slug: false
					}
				}
			]
		}
	},
	{
		collection: "cache_flush_targets",
		field: "url",
		type: "string",
		schema: {
			name: "url",
			table: "cache_flush_targets",
			data_type: "character varying",
			is_nullable: false,
			is_unique: true
		},
		meta: {
			collection: "cache_flush_targets",
			field: "url",
			interface: "input",
			options: {
				placeholder: "Endpoint for cache flush requests"
			},
			readonly: false,
			hidden: false,
			sort: 3,
			width: "full",
			required: true
		}
	},
	{
		collection: "cache_flush_targets",
		field: "auth_header",
		type: "string",
		schema: {
			name: "auth_header",
			table: "cache_flush_targets",
			data_type: "character varying",
			default_value: "bearer",
			max_length: 255,
			is_nullable: true
		},
		meta: {
			collection: "cache_flush_targets",
			field: "auth_header",
			interface: "select-dropdown",
			options: {
				choices: [
					{
						text: "Bearer",
						value: "bearer"
					},
					{
						text: "Api-Key",
						value: "api-key"
					},
					{
						text: "No Auth",
						value: "no-auth"
					}
				],
				allowOther: true,
				placeholder: "Which type of auth header does the request need?"
			},
			sort: 4,
			width: "half",
			required: true,
			note: "For custom headers, select 'Other' and enter the header name such as 'X-Auth-Token'"
		}
	},
	{
		collection: "cache_flush_targets",
		field: "schema",
		type: "json",
		schema: {
			name: "schema",
			table: "cache_flush_targets",
			data_type: "json",
			is_nullable: true
		},
		meta: {
			collection: "cache_flush_targets",
			field: "schema",
			special: [
				"cast-json"
			],
			interface: "input-code",
			options: {
				fields: [],
				template: "[\n    {\n        \"collection\": \"collection\",\n        \"events\": [ \"create\", \"update\", \"delete\" ],\n        \"payload\": [ \"id\", \"slug\" ]\n    }\n]"
			},
			display: "raw",
			readonly: false,
			hidden: false,
			sort: 7,
			width: "full",
			required: true,
			note: "Add collections and events for which flush requests should be sent, and configure which fields should be sent in the payload"
		}
	},
	{
		collection: "cache_flush_targets",
		field: "users_notification",
		type: "alias",
		schema: null,
		meta: {
			collection: "cache_flush_targets",
			field: "users_notification",
			special: [
				"m2m"
			],
			interface: "list-m2m",
			options: {
				enableCreate: false,
				limit: 5,
				template: "{{directus_users_id.avatar}}{{directus_users_id.first_name}}"
			},
			display: "related-values",
			display_options: {
				template: "{{directus_users_id.first_name}}"
			},
			readonly: false,
			hidden: false,
			sort: 6,
			width: "full",
			note: "Which users should receive a notification if the flush fails",
			required: false
		}
	}
] as unknown as Field[];

export const junctionFieldSchema = [
	{
		collection: "cache_flush_targets_directus_users",
		field: "id",
		type: "integer",
		schema: {
			name: "id",
			table: "cache_flush_targets_directus_users",
			data_type: "integer",
			default_value: "nextval('cache_flush_targets_directus_users_id_seq'::regclass)",
			numeric_precision: 32,
			numeric_scale: 0,
			is_nullable: false,
			is_unique: true,
			is_primary_key: true,
			has_auto_increment: true
		},
		meta: {
			collection: "cache_flush_targets_directus_users",
			field: "id",
			hidden: true,
			sort: 1,
			width: "full"
		}
	},
	{
		collection: "cache_flush_targets_directus_users",
		field: "cache_flush_targets_id",
		type: "uuid",
		schema: {
			name: "cache_flush_targets_id",
			table: "cache_flush_targets_directus_users",
			data_type: "uuid",
			is_nullable: true,
			foreign_key_table: "cache_flush_targets",
			foreign_key_column: "id"
		},
		meta: {
			collection: "cache_flush_targets_directus_users",
			field: "cache_flush_targets_id",
			hidden: true,
			sort: 2,
			width: "full"
		}
	},
	{
		collection: "cache_flush_targets_directus_users",
		field: "directus_users_id",
		type: "uuid",
		schema: {
			name: "directus_users_id",
			table: "cache_flush_targets_directus_users",
			data_type: "uuid",
			is_nullable: true,
			foreign_key_table: "directus_users",
			foreign_key_column: "id"
		},
		meta: {
			collection: "cache_flush_targets_directus_users",
			field: "directus_users_id",
			hidden: true,
			sort: 3
		}
	}
] as unknown as Field[];

export const collectionRelationSchema = [
	{
		collection: "cache_flush_targets",
		field: "user_created",
		related_collection: "directus_users",
		schema: {
			constraint_name: "cache_flush_targets_user_created_foreign",
			table: "cache_flush_targets",
			column: "user_created",
			foreign_key_table: "directus_users",
			foreign_key_column: "id",
			on_update: "NO ACTION",
			on_delete: "NO ACTION"
		},
		meta: {
			many_collection: "cache_flush_targets",
			many_field: "user_created",
			one_collection: "directus_users",
			one_deselect_action: "nullify"
		}
	},
	{
		collection: "cache_flush_targets",
		field: "user_updated",
		related_collection: "directus_users",
		schema: {
			constraint_name: "cache_flush_targets_user_updated_foreign",
			table: "cache_flush_targets",
			column: "user_updated",
			foreign_key_table: "directus_users",
			foreign_key_column: "id",
			on_update: "NO ACTION",
			on_delete: "NO ACTION"
		},
		meta: {
			many_collection: "cache_flush_targets",
			many_field: "user_updated",
			one_collection: "directus_users",
			one_deselect_action: "nullify"
		}
	}
] as Relation[];

export const junctionRelationSchema = [
	{
		collection: "cache_flush_targets_directus_users",
		field: "directus_users_id",
		related_collection: "directus_users",
		schema: {
			constraint_name: "cache_flush_targets_directus_users_directus_users_id_foreign",
			table: "cache_flush_targets_directus_users",
			column: "directus_users_id",
			foreign_key_table: "directus_users",
			foreign_key_column: "id",
			on_update: "NO ACTION",
			on_delete: "SET NULL"
		},
		meta: {
			many_collection: "cache_flush_targets_directus_users",
			many_field: "directus_users_id",
			one_collection: "directus_users",
			junction_field: "cache_flush_targets_id",
			one_deselect_action: "nullify"
		}
	},
	{
		collection: "cache_flush_targets_directus_users",
		field: "cache_flush_targets_id",
		related_collection: "cache_flush_targets",
		schema: {
			constraint_name: "cache_flush_targets_directus_users_remote___745a9721_foreign",
			table: "cache_flush_targets_directus_users",
			column: "cache_flush_targets_id",
			foreign_key_table: "cache_flush_targets",
			foreign_key_column: "id",
			on_update: "NO ACTION",
			on_delete: "SET NULL"
		},
		meta: {
			many_collection: "cache_flush_targets_directus_users",
			many_field: "cache_flush_targets_id",
			one_collection: "cache_flush_targets",
			one_field: "users_notification",
			junction_field: "directus_users_id",
			one_deselect_action: "nullify"
		}
	}
] as Relation[];
