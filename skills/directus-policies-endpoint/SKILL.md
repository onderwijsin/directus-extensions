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

Policies attached directly to the user and to every reachable role are included once, keyed by
policy ID. The default behavior recursively follows child roles. Use `depth` when the application
needs a bounded traversal:

| Query     | Included role policies                     |
| --------- | ------------------------------------------ |
| omitted   | All nested roles, recursively              |
| `depth=0` | The user's role only                       |
| `depth=1` | The user's role and its direct child roles |

```http
GET /users/me/policies?depth=1
Authorization: Bearer <token>
```

The bounded form requests the required nested relationships in one Directus service call. A
non-negative integer is the supported depth format; an omitted or malformed value uses recursive
resolution.

## Configuration

| Variable                    | Default | Description                              |
| --------------------------- | ------- | ---------------------------------------- |
| `POLICIES_ENDPOINT_ENABLED` | `true`  | Set to `false` to disable the extension. |

## Security and operations

The endpoint uses the current request's Directus accountability when reading system collections. It
never uses administrator accountability or changes the caller's permissions. Install it only in a
trusted, non-sandboxed Directus runtime. The extension does not provision policies, roles,
permissions, authentication, or infrastructure.
