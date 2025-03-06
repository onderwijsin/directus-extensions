import { Policy } from "@directus/types"

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