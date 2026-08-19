---
name: directus-policies-endpoint
description: Resolve the authenticated Directus user's direct and nested-role policies.
---

# Directus users policies endpoint

Use `@onderwijsin/directus-policies-endpoint` when an application needs the authenticated Directus
user's effective policies, including policies inherited through nested roles.

## Installation and prerequisites

```sh
pnpm add @onderwijsin/directus-policies-endpoint
```

Load the extension in a trusted Directus 12.2.0-or-newer runtime. It uses the built-in `users`,
`roles`, and `policies` system collections and does not create or modify any of them. The caller
must authenticate normally; anonymous access is rejected with HTTP 403.

## API

```http
GET /users/me/policies
Authorization: Bearer <token>
```

Each response item contains:

```json
{
  "id": "policy-id",
  "name": "Editors",
  "icon": "edit",
  "description": "Can edit content",
  "enforce_tfa": false,
  "admin_access": false,
  "app_access": true
}
```

Policies assigned directly to the user, to the accountability's effective roles, and to the public
role are resolved using Directus access-row semantics. Policies are filtered by `ip_access`, ordered
by role priority, and included once per policy ID.

```http
GET /users/me/policies
Authorization: Bearer <token>
```

The resolver caches results in local memory for up to five seconds, keyed by the accountability's
user, effective roles, and IP address.

## Configuration

| Variable                                                       | Default | Description                                           |
| -------------------------------------------------------------- | ------- | ----------------------------------------------------- |
| `POLICIES_ENDPOINT_ENABLED`                                    | `true`  | Set to `false` to disable the extension.              |
| `CACHE_ENABLED`                                                | `true`  | Enable effective-policy caching.                      |
| `CACHE_STORE`                                                  | unset   | Cache backend; defaults to `memory`.                  |
| `REDIS_ENABLED`                                                | `false` | Enables component-based Redis configuration.          |
| `REDIS`                                                        | —       | Complete Redis URL; takes precedence over components. |
| `REDIS_HOST`, `REDIS_PORT`, `REDIS_USERNAME`, `REDIS_PASSWORD` | —       | Required together for component-based Redis.          |

## Security and operations

The endpoint uses elevated service accountability to read the system access records needed to answer
the request. It does not change the caller's permissions or provision policies, roles, permissions,
authentication, or infrastructure. Install it only in a trusted, non-sandboxed Directus runtime.
