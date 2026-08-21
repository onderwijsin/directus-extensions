# @onderwijsin/directus-policies-endpoint

An authenticated Directus endpoint that returns the policies available to the current user,
including policies assigned directly to the user and policies assigned to nested roles.

## Installation

```sh
pnpm add @onderwijsin/directus-policies-endpoint
```

Install the package in a Directus 12.2.0-or-newer runtime and restart Directus so the bundle's
endpoint and cache-invalidation hook are loaded.

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
accountability, user, roles, and IP are used to resolve assignments and to read the associated
access and policy records. The authenticated user must have read access to the relevant
`directus_access` and `directus_policies` records, directly or through a role. Results are cached
only when valid Redis caching is configured, for up to three days per user/role/IP combination.
Without Redis, the endpoint does not cache policy results.

## Configuration

| Variable                                                       | Default | Description                                                                                      |
| -------------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------ |
| `POLICIES_ENDPOINT_ENABLED`                                    | `true`  | Set to `false` to disable the extension.                                                         |
| `DIRECTUS_POLICIES_ENDPOINT_BYPASS_ACCOUNTABILITY`             | `false` | Read all access and policy metadata with system accountability; use only in trusted deployments. |
| `CACHE_ENABLED`                                                | `true`  | Enables policy caching when the Redis configuration below is valid.                              |
| `CACHE_STORE`                                                  | unset   | Must be `redis` for policy caching; `memory` is intentionally ignored.                           |
| `REDIS_ENABLED`                                                | `false` | Enables component-based Redis configuration.                                                     |
| `REDIS`                                                        | —       | Complete Redis URL; takes precedence over components.                                            |
| `REDIS_HOST`, `REDIS_PORT`, `REDIS_USERNAME`, `REDIS_PASSWORD` | —       | Required together for component-based Redis.                                                     |
| `DIRECTUS_POLICY_CACHE_INVALIDATION_ENABLED`                   | `true`  | Registers global invalidation for `access`, `policies`, and `roles` CUD events.                  |

The policy cache uses the isolated Redis namespace `directus:policies` and is invalidated globally
when any `directus_access`, `directus_policies`, or `directus_roles` item is created, updated, or
deleted. If this bundle and another extension that registers the same invalidation are installed
together, set this option to `false` in one of them. `CACHE_STORE=redis` requires `REDIS` or all
four Redis component values; invalid or incomplete Redis configuration disables policy caching.

## Boundaries

The extension reads Directus's built-in access, policy, user, and role data; it does not create
roles or policies and does not change permissions.

This extension is non-sandboxed, so it does not carry the trust required for Directus Marketplace
distribution. Install it as an npm package in the Directus runtime. By default, it reads only access
and policy records allowed by the requesting user's accountability. Enabling
`DIRECTUS_POLICIES_ENDPOINT_BYPASS_ACCOUNTABILITY` makes the endpoint read all matching policy
metadata with system accountability; because that metadata is returned to the client, enable this
only when exposing all policy fields to every authenticated caller is acceptable. The extension
creates or changes no collections, fields, relations, roles, policies, permissions, or persistent
data.
