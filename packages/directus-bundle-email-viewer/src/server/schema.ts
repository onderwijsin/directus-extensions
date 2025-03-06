import type { Field } from '@directus/types';

export const policyFieldsSchema = [
    {
        "collection": "directus_policies",
        "field": "email_viewer_permission",
        "type": "string",
        "schema": {
            "name": "email_viewer_permission",
            "table": "directus_policies",
            "data_type": "character varying",
            "default_value": "none",
        },
        "meta": {
            "collection": "directus_policies",
            "field": "email_viewer_permission",
            "interface": "select-dropdown",
            "options": {
                "choices": [
                    {
                        "text": "Only user email",
                        "value": "self"
                    },
                    {
                        "text": "Specific email addresses",
                        "value": "specific"
                    },
                    {
                        "text": "All domain email",
                        "value": "domain"
                    },
                    {
                        "text": "All organization email",
                        "value": "all"
                    },
                    {
                        "text": "None",
                        "value": "none"
                    }
                ],
                "placeholder": "Choose permission type for email viewer"
            },
            "sort": 3,
            "width": "half",
            "required": true
        }
    },
    {
        "collection": "directus_policies",
        "field": "custom_addresses",
        "type": "json",
        "schema": {
            "name": "custom_addresses",
            "table": "directus_policies",
            "data_type": "json",
        },
        "meta": {
            "collection": "directus_policies",
            "field": "custom_addresses",
            "special": [
                "cast-json"
            ],
            "interface": "select-multiple-dropdown",
            "options": {
                "allowOther": true,
                "placeholder": "Enter email addresses"
            },
            "sort": 4,
            "width": "half",
            "conditions": [
                {
                    "name": "Visibility",
                    "rule": {
                        "_and": [
                            {
                                "email_viewer_permission": {
                                    "_neq": "specific"
                                }
                            }
                        ]
                    },
                    "hidden": true,
                    "options": {
                        "allowOther": false,
                        "allowNone": false,
                        "previewThreshold": 3
                    }
                },
                {
                    "name": "Required",
                    "rule": {
                        "_and": [
                            {
                                "email_viewer_permission": {
                                    "_eq": "specific"
                                }
                            }
                        ]
                    },
                    "required": true,
                    "options": {
                        "allowOther": true,
                        "allowNone": false,
                        "previewThreshold": 3
                    }
                }
            ]
        }
    },
    {
        "collection": "directus_policies",
        "field": "divider_email_viewer",
        "type": "alias",
        "schema": null,
        "meta": {
            "collection": "directus_policies",
            "field": "divider_email_viewer",
            "special": [
                "alias",
                "no-data"
            ],
            "interface": "presentation-divider",
            "options": {
                "title": "Email Viewer",
                "color": null,
                "icon": "attach_email"
            },
            "sort": 1,
            "width": "full",
        }
    },
    {
        "collection": "directus_policies",
        "field": "notice-nbjgca",
        "type": "alias",
        "schema": null,
        "meta": {
            "collection": "directus_policies",
            "field": "notice-nbjgca",
            "special": [
                "alias",
                "no-data"
            ],
            "interface": "presentation-notice",
            "options": {
                "color": "info",
                "text": "These settings determine what emails can be viewed by a user within the email viewer interface. By default, these settings are as restrictive as possible. You can edit these as you see fit; but beware that you don't overshare. It is never possible to view internal emails (i.e. emails sent between the organization's domains), this is design choice."
            },
            "sort": 2,
            "width": "full",
        }
    }
] as unknown as Field[]