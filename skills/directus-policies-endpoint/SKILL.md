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

Load the bundle in a Directus 12.2.0-or-newer runtime. It uses the built-in `users`, `roles`, and
`policies` system collections and does not create or modify any of them. The caller must
authenticate normally; anonymous access is rejected with HTTP 403.

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

By default, the endpoint reads access and policy metadata using the requesting accountability. The
user therefore needs read access to the relevant `directus_access` and `directus_policies` records,
directly or through a role. The endpoint does not use elevated accountability implicitly.

```http
GET /users/me/policies
Authorization: Bearer <token>
```

The resolver caches results only with valid Redis configuration, for up to three days, keyed by the
accountability's user, effective roles, and IP address. Without Redis, it does not cache. Redis uses
the isolated `directus:policies` namespace so the bundle hook can clear it across processes.

## Configuration

| Variable                                                       | Default | Description                                                                                      |
| -------------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------ |
| `POLICIES_ENDPOINT_ENABLED`                                    | `true`  | Set to `false` to disable the extension.                                                         |
| `DIRECTUS_POLICIES_ENDPOINT_BYPASS_ACCOUNTABILITY`             | `false` | Read all access and policy metadata with system accountability; use only in trusted deployments. |
| `CACHE_ENABLED`                                                | `true`  | Enables policy caching when valid Redis settings are present.                                    |
| `CACHE_STORE`                                                  | unset   | Must be `redis`; `memory` is intentionally ignored for policy caching.                           |
| `REDIS_ENABLED`                                                | `false` | Enables component-based Redis configuration.                                                     |
| `REDIS`                                                        | —       | Complete Redis URL; takes precedence over components.                                            |
| `REDIS_HOST`, `REDIS_PORT`, `REDIS_USERNAME`, `REDIS_PASSWORD` | —       | Required together for component-based Redis.                                                     |
| `DIRECTUS_POLICY_CACHE_INVALIDATION_ENABLED`                   | `true`  | Registers invalidation for `access`, `policies`, and `roles` create/update/delete events.        |

The hook clears the complete `directus:policies` namespace after any mutation in those three system
collections. If another installed extension registers the same invalidation, disable this setting in
one extension to avoid duplicate hook registration. Redis must be configured with
`CACHE_STORE=redis` and either `REDIS` or all four component values; otherwise caching is bypassed.

## Security and operations

Set `DIRECTUS_POLICIES_ENDPOINT_BYPASS_ACCOUNTABILITY=true` only when every authenticated caller may
receive all matching policy metadata. This bypass applies to server-side reads in the extension and
can expose policy data the caller would not normally have CRUD access to. The endpoint does not
change the caller's permissions or provision policies, roles, permissions, authentication, or
infrastructure.

## Boundaries

This extension is non-sandboxed, so it does not carry the trust required for Directus Marketplace
distribution. Install it as an npm package in the Directus runtime. It reads existing Directus
access, policy, user, and role data, but creates or changes no collections, fields, relations,
roles, policies, permissions, or persistent data.
