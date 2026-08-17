# `@onderwijsin/directus-policies-endpoint`

An authenticated Directus endpoint that returns the policies available to the current user,
including policies assigned directly to the user and policies assigned to nested roles.

## Installation

```sh
pnpm add @onderwijsin/directus-policies-endpoint
```

Install the package in a trusted Directus 12.2.0-or-newer runtime and restart Directus so the
endpoint extension is loaded.

## Endpoint

`GET /users/me/policies`

The endpoint requires an authenticated request. It returns an array of policies containing only
`id`, `name`, `icon`, `description`, `enforce_tfa`, `admin_access`, and `app_access`. Policies are
deduplicated by ID.

By default, nested roles are traversed recursively. To limit traversal to a known depth, provide a
non-negative `depth` query parameter. `depth=0` includes the user's role policies only, while
`depth=1` includes that role's immediate child roles as well:

```http
GET /users/me/policies?depth=1
Authorization: Bearer <token>
```

Anonymous requests receive Directus's standard `403 Forbidden` response. The requester's
accountability is passed to Directus services, so the endpoint does not elevate privileges.

## Configuration

| Variable                    | Default | Description                              |
| --------------------------- | ------- | ---------------------------------------- |
| `POLICIES_ENDPOINT_ENABLED` | `true`  | Set to `false` to disable the extension. |

## Boundaries

The extension reads Directus's built-in `users`, `roles`, and `policies` relationships; it does not
create roles or policies and does not change permissions. It is non-sandboxed and requires a trusted
Directus installation.
