import type { Field } from "@directus/types";

export const policyFieldsSchema = [
	{
		collection: "directus_policies",
		field: "email_viewer_permission",
		type: "string",
		schema: {
			name: "email_viewer_permission",
			table: "directus_policies",
			data_type: "character varying",
			default_value: "none"
		},
		meta: {
			collection: "directus_policies",
			field: "email_viewer_permission",
			interface: "select-dropdown",
			options: {
				choices: [
					{
						text: "Only user email",
						value: "self"
					},
					{
						text: "Specific email addresses",
						value: "specific"
					},
					{
						text: "All domain email",
						value: "domain"
					},
					{
						text: "All organization email",
						value: "all"
					},
					{
						text: "None",
						value: "none"
					}
				],
				placeholder: "Choose permission type for email viewer"
			},
			sort: 3,
			width: "half",
			required: true
		}
	},
	{
		collection: "directus_policies",
		field: "email_viewer_custom_addresses",
		type: "json",
		schema: {
			name: "email_viewer_custom_addresses",
			table: "directus_policies",
			data_type: "json"
		},
		meta: {
			collection: "directus_policies",
			field: "email_viewer_custom_addresses",
			special: [
				"cast-json"
			],
			interface: "select-multiple-dropdown",
			options: {
				allowOther: true,
				placeholder: "Enter email addresses"
			},
			sort: 4,
			width: "half",
			conditions: [
				{
					name: "Visibility",
					rule: {
						_and: [
							{
								email_viewer_permission: {
									_neq: "specific"
								}
							}
						]
					},
					hidden: true,
					options: {
						allowOther: false,
						allowNone: false,
						previewThreshold: 3
					}
				},
				{
					name: "Required",
					rule: {
						_and: [
							{
								email_viewer_permission: {
									_eq: "specific"
								}
							}
						]
					},
					required: true,
					options: {
						allowOther: true,
						allowNone: false,
						previewThreshold: 3
					}
				}
			]
		}
	},
	{
		collection: "directus_policies",
		field: "divider_email_viewer",
		type: "alias",
		schema: null,
		meta: {
			collection: "directus_policies",
			field: "divider_email_viewer",
			special: [
				"alias",
				"no-data"
			],
			interface: "presentation-divider",
			options: {
				title: "Email Viewer",
				color: null,
				icon: "attach_email"
			},
			sort: 1,
			width: "full"
		}
	},
	{
		collection: "directus_policies",
		field: "email_viewer_notice",
		type: "alias",
		schema: null,
		meta: {
			collection: "directus_policies",
			field: "email_viewer_notice",
			special: [
				"alias",
				"no-data"
			],
			interface: "presentation-notice",
			options: {
				color: "info",
				text: "These settings determine what emails can be viewed by a user within the email viewer interface. By default, these settings are as restrictive as possible. You can edit these as you see fit; but beware that you don't overshare. It is never possible to view internal emails (i.e. emails sent between the organization's domains), this is design choice.\n\n Note that there are also global settings available in the settings panel"
			},
			sort: 2,
			width: "full"
		}
	}
] as unknown as Field[];

export const settingsFieldSchema = [
	{
		collection: "directus_settings",
		field: "divider_email_viewer",
		type: "alias",
		schema: null,
		meta: {
			collection: "directus_settings",
			field: "divider_email_viewer",
			special: [
				"alias",
				"no-data"
			],
			interface: "presentation-divider",
			options: {
				title: "Email Viewer",
				color: null,
				icon: "attach_email"
			},
			width: "full"
		}
	},
	{
		collection: "directus_settings",
		field: "email_viewer_excluded_emails",
		type: "json",
		schema: {
			name: "email_viewer_excluded_emails",
			table: "directus_settings",
			data_type: "json"
		},
		meta: {
			collection: "directus_settings",
			field: "email_viewer_excluded_emails",
			special: [
				"cast-json"
			],
			interface: "select-multiple-dropdown",
			options: {
				allowOther: true,
				placeholder: "Enter emails to exclude",
				previewThreshold: 2
			},
			width: "full",
			note: "Excluded email adresses will never be visible in the email viewer"
		}
	},
	{
		collection: "directus_settings",
		field: "email_viewer_show_email_body",
		type: "boolean",
		schema: {
			name: "email_viewer_show_email_body",
			table: "directus_settings",
			data_type: "boolean",
			default_value: false,
			is_nullable: false
		},
		meta: {
			collection: "directus_settings",
			field: "email_viewer_show_email_body",
			special: [
				"cast-boolean"
			],
			interface: "boolean",
			options: {
				colorOn: "#2ECDA7",
				colorOff: "#E35169",
				label: "Show email body in viewer"
			},
			display: "boolean",
			display_options: {
				labelOn: "Show body",
				labelOff: "Hide body"
			},
			note: "If disabled only a preview of the email will be shown"
		}
	},
	{
		collection: "directus_settings",
		field: "email_viewer_global_excluded_tags",
		type: "csv",
		schema: {
			name: "email_viewer_global_excluded_tags",
			table: "directus_settings",
			data_type: "text"
		},
		meta: {
			collection: "directus_settings",
			field: "email_viewer_global_excluded_tags",
			special: [
				"cast-csv"
			],
			interface: "tags",
			options: {
				placeholder: "Add tags to filter email by"
			},
			display: "labels",
			display_options: {
				format: false
			}
		}
	}
] as unknown as Field[];

// CRM niet zichtbaar
// CRM verborgen
// Datahub verborgen
// CRM verborgen

export const userFieldSchema = [
	{
		collection: "directus_users",
		field: "divider_email_viewer",
		type: "alias",
		schema: null,
		meta: {
			collection: "directus_users",
			field: "divider_email_viewer",
			special: [
				"alias",
				"no-data"
			],
			interface: "presentation-divider",
			options: {
				title: "Email Viewer",
				color: null,
				icon: "attach_email"
			},
			width: "full"
		}
	},
	{
		collection: "directus_users",
		field: "email_viewer_excluded_tags",
		type: "csv",
		schema: {
			name: "email_viewer_excluded_tags",
			table: "directus_users",
			data_type: "text"
		},
		meta: {
			collection: "directus_users",
			field: "email_viewer_excluded_tags",
			special: [
				"cast-csv"
			],
			interface: "tags",
			options: {
				placeholder: "Add tags to filter email by"
			},
			display: "labels",
			display_options: {
				format: false
			}
		}
	}
] as unknown as Field[];
