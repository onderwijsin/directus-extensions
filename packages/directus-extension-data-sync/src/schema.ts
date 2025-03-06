import { Field, Policy, Collection, Relation } from "@directus/types"

export const dataSyncPolicySchema: Policy = {
    "id": "2e76994c-a4eb-47ac-b811-e4692ad9de5e",
    "name": "Data Sync",
    "icon": "sync_lock",
    "description": "A policy reserved for API keys that are used by the data sync extension.",
    "ip_access": [],
    "enforce_tfa": false,
    "admin_access": false,
    "app_access": false,
}

export const dataSyncUserSchema = {
    "id": "7c6b6863-d298-453d-a192-4a343eb7ddd3",
    "first_name": "Data Sync",
    "last_name": "Directus",
    "email": "noreply@directusdatasync.com",
    "description": "A user reserved for the data sync extension.",
    "tags": ["data-sync", "api"],
    "status": "active",
    "provider": "default",
    "email_notifications": false,
}

export const dataSyncAccessSchema = {
    "id": "c40c6bec-bfaf-4b22-8045-bbfb42081c2a",
    "user": "7c6b6863-d298-453d-a192-4a343eb7ddd3",
    "policy": "2e76994c-a4eb-47ac-b811-e4692ad9de5e",
}

export const collectionSchema = {
    "collection": "remote_data_sources",
    "meta": {
        "collection": "remote_data_sources",
        "icon": "sync_lock",
        "note": "Configuration of remote instances for data sync extension",
        "display_template": '{{ url }}',
        "hidden": false,
        "singleton": false,
        "archive_field": "status",
        "archive_app_filter": true,
        "archive_value": "archived",
        "unarchive_value": "draft",
        "accountability": "all",
        "versioning": false
    },
    "schema": {
        "schema": "public",
        "name": "remote_data_sources"
    }
} as Collection

export const junctionSchema = {
    "collection": "remote_data_sources_directus_users",
    "meta": {
        "collection": "remote_data_sources_directus_users",
        "icon": "import_export",
        "hidden": true,
        "singleton": false,
        "accountability": "all",
    },
    "schema": {
        "schema": "public",
        "name": "remote_data_sources_directus_users",
    }
} as Collection

export const collectionFieldSchema = [
    {
        "collection": "remote_data_sources",
        "field": "id",
        "type": "uuid",
        "schema": {
            "name": "id",
            "table": "remote_data_sources",
            "data_type": "uuid",
            "is_nullable": false,
            "is_unique": true,
            "is_primary_key": true,
        },
        "meta": {
            "collection": "remote_data_sources",
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
        "collection": "remote_data_sources",
        "field": "status",
        "type": "string",
        "schema": {
            "name": "status",
            "table": "remote_data_sources",
            "data_type": "character varying",
            "default_value": "draft",
            "is_nullable": false,
        },
        "meta": {
            "collection": "remote_data_sources",
            "field": "status",
            "interface": "select-dropdown",
            "options": {
                "choices": [
                    {
                        "text": "$t:published",
                        "value": "published",
                        "color": "var(--theme--primary)"
                    },
                    {
                        "text": "$t:draft",
                        "value": "draft",
                        "color": "var(--theme--foreground)"
                    },
                    {
                        "text": "$t:archived",
                        "value": "archived",
                        "color": "var(--theme--warning)"
                    }
                ]
            },
            "display": "labels",
            "display_options": {
                "showAsDot": true,
                "choices": [
                    {
                        "text": "$t:published",
                        "value": "published",
                        "color": "var(--theme--primary)",
                        "foreground": "var(--theme--primary)",
                        "background": "var(--theme--primary-background)"
                    },
                    {
                        "text": "$t:draft",
                        "value": "draft",
                        "color": "var(--theme--foreground)",
                        "foreground": "var(--theme--foreground)",
                        "background": "var(--theme--background-normal)"
                    },
                    {
                        "text": "$t:archived",
                        "value": "archived",
                        "color": "var(--theme--warning)",
                        "foreground": "var(--theme--warning)",
                        "background": "var(--theme--warning-background)"
                    }
                ]
            },
            "readonly": false,
            "hidden": false,
            "sort": 2,
            "width": "full",
        }
    },
    {
        "collection": "remote_data_sources",
        "field": "user_created",
        "type": "uuid",
        "schema": {
            "name": "user_created",
            "table": "remote_data_sources",
            "data_type": "uuid",
            "is_nullable": true,
            "foreign_key_schema": "public",
            "foreign_key_table": "directus_users",
            "foreign_key_column": "id",
        },
        "meta": {
            "collection": "remote_data_sources",
            "field": "user_created",
            "special": [
                "user-created"
            ],
            "interface": "select-dropdown-m2o",
            "options": {
                "template": "{{avatar}} {{first_name}} {{last_name}}"
            },
            "display": "user",
            "readonly": true,
            "hidden": false,
            "sort": 7,
            "width": "half",
        }
    },
    {
        "collection": "remote_data_sources",
        "field": "date_created",
        "type": "timestamp",
        "schema": {
            "name": "date_created",
            "table": "remote_data_sources",
            "data_type": "timestamp with time zone",
        },
        "meta": {
            "collection": "remote_data_sources",
            "field": "date_created",
            "special": [
                "date-created"
            ],
            "interface": "datetime",
            "display": "datetime",
            "display_options": {
                "relative": true
            },
            "readonly": true,
            "hidden": false,
            "sort": 8,
            "width": "half",
        }
    },
    {
        "collection": "remote_data_sources",
        "field": "user_updated",
        "type": "uuid",
        "schema": {
            "name": "user_updated",
            "table": "remote_data_sources",
            "data_type": "uuid",
            "foreign_key_schema": "public",
            "foreign_key_table": "directus_users",
            "foreign_key_column": "id",
        },
        "meta": {
            "collection": "remote_data_sources",
            "field": "user_updated",
            "special": [
                "user-updated"
            ],
            "interface": "select-dropdown-m2o",
            "options": {
                "template": "{{avatar}} {{first_name}} {{last_name}}"
            },
            "display": "user",
            "readonly": true,
            "hidden": false,
            "sort": 9,
            "width": "half",
        }
    },
    {
        "collection": "remote_data_sources",
        "field": "date_updated",
        "type": "timestamp",
        "schema": {
            "name": "date_updated",
            "table": "remote_data_sources",
            "data_type": "timestamp with time zone",
        },
        "meta": {
            "collection": "remote_data_sources",
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
            "hidden": false,
            "sort": 10,
            "width": "half",
        }
    },
    {
        "collection": "remote_data_sources",
        "field": "api_key",
        "type": "string",
        "schema": {
            "name": "api_key",
            "table": "remote_data_sources",
            "data_type": "character varying",
            "is_nullable": false,
        },
        "meta": {
            "collection": "remote_data_sources",
            "field": "api_key",
            "interface": "input",
            "options": {
                "placeholder": "Enter remote API key",
                "masked": true
            },
            "display": "formatted-value",
            "display_options": {
                "masked": true
            },
            "readonly": false,
            "hidden": false,
            "sort": 4,
            "width": "full",
            "required": true,
        }
    },
    {
        "collection": "remote_data_sources",
        "field": "url",
        "type": "string",
        "schema": {
            "name": "url",
            "table": "remote_data_sources",
            "data_type": "character varying",
            "is_nullable": false,
            "is_unique": true,
        },
        "meta": {
            "collection": "remote_data_sources",
            "field": "url",
            "interface": "input",
            "options": {
                "placeholder": "Base URL for remote instance"
            },
            "readonly": false,
            "hidden": false,
            "sort": 3,
            "width": "full",
            "required": true,
        }
    },
    {
        "collection": "remote_data_sources",
        "field": "schema",
        "type": "json",
        "schema": {
            "name": "schema",
            "table": "remote_data_sources",
            "data_type": "json",
            "is_nullable": true,
        },
        "meta": {
            "collection": "remote_data_sources",
            "field": "schema",
            "special": [
                "cast-json"
            ],
            "interface": "input-code",
            "options": {
                "fields": [],
                "template": "[\n    {\n        \"name\": \"collection\",\n        \"fields\": [ \"field_key\" ]\n    }\n]"
            },
            "display": "raw",
            "readonly": false,
            "hidden": false,
            "sort": 6,
            "width": "full",
            "required": true,
        }
    },
    {
        "collection": "remote_data_sources",
        "field": "users_notification",
        "type": "alias",
        "schema": null,
        "meta": {
            "collection": "remote_data_sources",
            "field": "users_notification",
            "special": [
                "m2m"
            ],
            "interface": "list-m2m",
            "options": {
                "enableCreate": false,
                "limit": 5,
                "template": "{{directus_users_id.avatar}}{{directus_users_id.first_name}}"
            },
            "display": "related-values",
            "display_options": {
                "template": "{{directus_users_id.first_name}}"
            },
            "readonly": false,
            "hidden": false,
            "sort": 5,
            "width": "full",
            "note": "Which users should receive a notification if the sync fails",
            "required": false,
        }
    }
] as unknown as Field[]

export const junctionFieldSchema = [
    {
        "collection": "remote_data_sources_directus_users",
        "field": "id",
        "type": "integer",
        "schema": {
            "name": "id",
            "table": "remote_data_sources_directus_users",
            "data_type": "integer",
            "default_value": "nextval('remote_data_sources_directus_users_id_seq'::regclass)",
            "numeric_precision": 32,
            "numeric_scale": 0,
            "is_nullable": false,
            "is_unique": true,
            "is_primary_key": true,
            "has_auto_increment": true,
        },
        "meta": {
            "collection": "remote_data_sources_directus_users",
            "field": "id",
            "hidden": true,
            "sort": 1,
            "width": "full",
        }
    },
    {
        "collection": "remote_data_sources_directus_users",
        "field": "remote_data_sources_id",
        "type": "uuid",
        "schema": {
            "name": "remote_data_sources_id",
            "table": "remote_data_sources_directus_users",
            "data_type": "uuid",
            "is_nullable": true,
            "foreign_key_schema": "public",
            "foreign_key_table": "remote_data_sources",
            "foreign_key_column": "id",
        },
        "meta": {
            "collection": "remote_data_sources_directus_users",
            "field": "remote_data_sources_id",
            "hidden": true,
            "sort": 2,
            "width": "full",
        }
    },
    {
        "collection": "remote_data_sources_directus_users",
        "field": "directus_users_id",
        "type": "uuid",
        "schema": {
            "name": "directus_users_id",
            "table": "remote_data_sources_directus_users",
            "data_type": "uuid",
            "is_nullable": true,
            "foreign_key_schema": "public",
            "foreign_key_table": "directus_users",
            "foreign_key_column": "id",
        },
        "meta": {
            "collection": "remote_data_sources_directus_users",
            "field": "directus_users_id",
            "hidden": true,
            "sort": 3,
        }
    }
] as unknown as Field[]


export const collectionRelationSchema = [
    {
        "collection": "remote_data_sources",
        "field": "user_created",
        "related_collection": "directus_users",
        "schema": {
            "constraint_name": "remote_data_sources_user_created_foreign",
            "table": "remote_data_sources",
            "column": "user_created",
            "foreign_key_schema": "public",
            "foreign_key_table": "directus_users",
            "foreign_key_column": "id",
            "on_update": "NO ACTION",
            "on_delete": "NO ACTION"
        },
        "meta": {
            "many_collection": "remote_data_sources",
            "many_field": "user_created",
            "one_collection": "directus_users",
            "one_deselect_action": "nullify"
        }
    },
    {
        "collection": "remote_data_sources",
        "field": "user_updated",
        "related_collection": "directus_users",
        "schema": {
            "constraint_name": "remote_data_sources_user_updated_foreign",
            "table": "remote_data_sources",
            "column": "user_updated",
            "foreign_key_schema": "public",
            "foreign_key_table": "directus_users",
            "foreign_key_column": "id",
            "on_update": "NO ACTION",
            "on_delete": "NO ACTION"
        },
        "meta": {
            "many_collection": "remote_data_sources",
            "many_field": "user_updated",
            "one_collection": "directus_users",
            "one_deselect_action": "nullify"
        }
    }
] as Relation[]


export const junctionRelationSchema = [
    {
        "collection": "remote_data_sources_directus_users",
        "field": "directus_users_id",
        "related_collection": "directus_users",
        "schema": {
            "constraint_name": "remote_data_sources_directus_users_directus_users_id_foreign",
            "table": "remote_data_sources_directus_users",
            "column": "directus_users_id",
            "foreign_key_schema": "public",
            "foreign_key_table": "directus_users",
            "foreign_key_column": "id",
            "on_update": "NO ACTION",
            "on_delete": "SET NULL"
        },
        "meta": {
            "many_collection": "remote_data_sources_directus_users",
            "many_field": "directus_users_id",
            "one_collection": "directus_users",
            "junction_field": "remote_data_sources_id",
            "one_deselect_action": "nullify"
        }
    },
    {
        "collection": "remote_data_sources_directus_users",
        "field": "remote_data_sources_id",
        "related_collection": "remote_data_sources",
        "schema": {
            "constraint_name": "remote_data_sources_directus_users_remote___745a9721_foreign",
            "table": "remote_data_sources_directus_users",
            "column": "remote_data_sources_id",
            "foreign_key_schema": "public",
            "foreign_key_table": "remote_data_sources",
            "foreign_key_column": "id",
            "on_update": "NO ACTION",
            "on_delete": "SET NULL"
        },
        "meta": {
            "many_collection": "remote_data_sources_directus_users",
            "many_field": "remote_data_sources_id",
            "one_collection": "remote_data_sources",
            "one_field": "users_notification",
            "junction_field": "directus_users_id",
            "one_deselect_action": "nullify"
        }
    }
] as Relation[]