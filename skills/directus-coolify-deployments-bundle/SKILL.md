---
name: directus-coolify-deployments-bundle
description: Configure and operate the Coolify deployments bundle in a trusted Directus runtime.
---

# Directus Coolify deployments bundle

`@onderwijsin/directus-coolify-deployments-bundle` is a Directus bundle for triggering and
inspecting frontend deployments in Coolify from Studio and Flows.

The endpoint, server-side Coolify client, native-style Studio module, and schema-management hook are
implemented. The Flow operation remains scaffold-only.

## Installation

```sh
pnpm add @onderwijsin/directus-coolify-deployments-bundle
```

Run it in a trusted, non-sandboxed Directus installation. The package does not install Coolify or
create a Coolify API token for you.

The bundle supports one Coolify instance per Directus installation, configured through a single
`COOLIFY_URL`. `COOLIFY_TOKEN` must have read and deploy access for every integrated Coolify
application or project. Per-application Coolify API tokens are not currently supported.

## Configuration

| Variable                                                       | Required         | Default                | Description                                                        |
| -------------------------------------------------------------- | ---------------- | ---------------------- | ------------------------------------------------------------------ |
| `COOLIFY_DEPLOYMENTS_ENABLED`                                  | no               | `true`                 | Enables the bundle entries.                                        |
| `COOLIFY_APPLICATIONS_COLLECTION`                              | no               | `coolify_applications` | Allow-listed applications collection.                              |
| `COOLIFY_DEPLOYMENTS_SCHEMA_CHANGES_ENABLED`                   | no               | `true`                 | Enables this bundle's schema changes.                              |
| `COOLIFY_DEPLOYMENTS_SCHEMA_ABORT_ON_ERROR`                    | no               | `true`                 | Aborts schema setup after an unexpected error.                     |
| `COOLIFY_URL`                                                  | yes when enabled | —                      | Base URL of the Coolify instance.                                  |
| `COOLIFY_TOKEN`                                                | yes when enabled | —                      | Server-only least-privilege Coolify API token.                     |
| `COOLIFY_PROJECTS`                                             | no               | `[]`                   | JSON/Directus array of configured frontend project definitions.    |
| `CACHE_ENABLED`                                                | no               | `true`                 | Enables caching of configured application records.                 |
| `SYNCHRONIZATION_STORE`                                        | no               | `memory`               | Directus synchronization backend; unrelated to cache selection.    |
| `CACHE_STORE`                                                  | no               | unset                  | Cache backend; defaults to `memory`.                               |
| `REDIS_ENABLED`                                                | when Redis cache | `false`                | Enables component-based Redis configuration.                       |
| `REDIS`                                                        | when Redis cache | —                      | Complete URL; takes precedence over component values.              |
| `REDIS_HOST`, `REDIS_PORT`, `REDIS_USERNAME`, `REDIS_PASSWORD` | when Redis cache | —                      | Required together for component-based Redis.                       |
| `COOLIFY_DEPLOYMENTS_MANAGE_APPLICATIONS_POLICY_ID`            | no               | stable UUID            | UUID of the policy that manages local Coolify application records. |
| `COOLIFY_DEPLOYMENTS_READ_DEPLOYMENTS_POLICY_ID`               | no               | stable UUID            | UUID of the policy that reads Coolify deployment resources.        |
| `COOLIFY_DEPLOYMENTS_TRIGGER_DEPLOYMENTS_POLICY_ID`            | no               | stable UUID            | UUID of the policy that triggers Coolify deployments.              |
| `COOLIFY_DEPLOYMENTS_POLL_INTERVAL_MS`                         | no               | `5000`                 | Studio polling interval in milliseconds; minimum `250`.            |

Each project definition has this shape:

```json
{
  "id": "onderwijsloket",
  "name": "Onderwijsloket",
  "productionUrl": "https://onderwijsloket.example.com",
  "resourceUuid": "coolify-resource-uuid"
}
```

`id` is intended to be the stable identifier submitted by Studio or a Flow. Consumers must not
submit arbitrary Coolify application or resource UUIDs.

## Current extension entries

- Studio module: `Coolify deployments`;
- endpoint base path: `/coolify-deployments`; and
- schema-managed collection: `coolify_applications`; and
- Flow operation: `Coolify Deploy`, with `project` and `force` options.

The endpoint is usable by authenticated clients. The module provides dashboard, application,
deployment-history, and deployment-detail views with active-deployment polling and cancellation; the
Flow operation still returns scaffold-only “not implemented yet” behavior.

The `coolify-deployments-hook` entry creates the allow-listed applications collection at startup. It
uses the shared schema-change lock; endpoint routes return `503` while the collection schema is
being ensured. The server-side client reads configured applications with administrative
accountability and caches them for 60 seconds. Select `memory` for a process-local cache or `redis`
with a valid complete `REDIS` URL or component-based Redis configuration for a shared cache.

The managed `coolify_applications` collection requires every field, including project and
environment metadata and the production URL; none of its fields accept `null`. All fields are
read-only in Studio except `application_uuid`, which is the first visible field after the hidden
primary key.

To add an application, create a record with only its Coolify application UUID. The bundle's create
filter fetches the application from Coolify and populates its name, project UUID and name,
environment UUID and name, and production URL. The local `enabled` and `deploy_enabled` flags are
initialized to `true`. If Coolify cannot be reached or returns incomplete data, creation fails and
no partial record is saved.

When global data seeding is enabled, the startup coordinator also creates the three Coolify policy
records. Their UUIDs are configurable through the policy ID variables. The bundled permission
definitions describe local CRUD access and remote GET/POST feature flags, and are persisted as
separate `directus_permissions` rows. Directus generates integer permission IDs; the bundle uses
`policy + collection + action` as the idempotency key and preserves matching existing rows.

## Endpoint behavior

All endpoint routes require an authenticated Directus session, pass the same-origin check, and
require the corresponding assigned policy below. Administrators bypass policy assignment checks.
Missing browser origin metadata is allowed for authenticated non-browser clients. The routes resolve
stable Directus application IDs and return normalized application/deployment data.

| Method | Route                                                                    | Behavior                         |
| ------ | ------------------------------------------------------------------------ | -------------------------------- |
| `GET`  | `/coolify-deployments/applications`                                      | List configured applications.    |
| `GET`  | `/coolify-deployments/permissions`                                       | Check deployment trigger access. |
| `GET`  | `/coolify-deployments/applications/:id/deployments`                      | List deployments.                |
| `GET`  | `/coolify-deployments/applications/:id/deployments/:deploymentId`        | Read one deployment.             |
| `POST` | `/coolify-deployments/applications/:id/deployments`                      | Trigger a deployment.            |
| `POST` | `/coolify-deployments/applications/:id/deployments/:deploymentId/cancel` | Cancel a deployment.             |

Authentication and same-origin failures are forwarded as Directus `403 Forbidden` errors. Schema
readiness failures are also forwarded through Directus's error middleware.

Policy assignments are resolved from `directus_access` for the current user and Directus's resolved
effective roles. Public assignments are included when no effective roles exist. The helper mirrors
Directus's assignment resolution but does not evaluate `policy.ip_access` against the request IP;
IP-based filtering is intentionally out of scope for this iteration and remains a TODO in the
extension helper.

## Security and ownership model

The implementation keeps Coolify credentials server-side, authenticates endpoint requests with the
active Directus session, and validates normalized responses before returning them. Configure a
dedicated Directus capability for triggering a deployment. The package resolves stable project IDs
to configured Coolify application UUIDs.

Directus Flows, rather than this package, will own scheduled and conditional automation. The bundle
will not add a scheduler or condition engine.

## Boundaries

The bundle does not provide logs, retry, persistence, per-application permissions, or Coolify
configuration management.
