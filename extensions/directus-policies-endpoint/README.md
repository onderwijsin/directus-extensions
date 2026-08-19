# @onderwijsin/directus-policies-endpoint

An authenticated Directus endpoint that returns the policies available to the current user,
including policies assigned directly to the user and policies assigned to nested roles.

## Installation

```sh
pnpm add @onderwijsin/directus-policies-endpoint
```

Install the package in a Directus 12.2.0-or-newer runtime and restart Directus so the endpoint
extension is loaded.

## Endpoint

`GET /users/me/policies`

The endpoint requires an authenticated request. It returns an array of effective policies containing
only `id`, `name`, `icon`, `description`, `enforce_tfa`, `admin_access`, and `app_access`. Policies
are deduplicated by ID and filtered by each policy's `ip_access` allow list.

```http
GET /users/me/policies
Authorization: Bearer <token>
```

Anonymous requests receive Directus's standard `403 Forbidden` response. The requester's
accountability's user, roles, and IP are used to resolve assignments. The endpoint uses elevated
service accountability to read the system access records required for this response; this is an
intentional server-side implementation detail. Results are cached in local memory for up to five
seconds per user/role/IP combination.

## Configuration

| Variable                                                       | Default | Description                                               |
| -------------------------------------------------------------- | ------- | --------------------------------------------------------- |
| `POLICIES_ENDPOINT_ENABLED`                                    | `true`  | Set to `false` to disable the extension.                  |
| `CACHE_ENABLED`                                                | `true`  | Enable effective-policy caching.                          |
| `CACHE_STORE`                                                  | unset   | Cache backend: `memory` or `redis`; defaults to `memory`. |
| `REDIS_ENABLED`                                                | `false` | Enables component-based Redis configuration.              |
| `REDIS`                                                        | —       | Complete Redis URL; takes precedence over components.     |
| `REDIS_HOST`, `REDIS_PORT`, `REDIS_USERNAME`, `REDIS_PASSWORD` | —       | Required together for component-based Redis.              |

## Boundaries

The extension reads Directus's built-in access, policy, user, and role data; it does not create
roles or policies and does not change permissions.

This extension is non-sandboxed, so it does not carry the trust required for Directus Marketplace
distribution. Install it as an npm package in the Directus runtime. It reads existing Directus
access, policy, user, and role data with elevated server-side accountability, but creates or changes
no collections, fields, relations, roles, policies, permissions, or persistent data.
