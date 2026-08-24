# @onderwijsin/directus-coolify-deployments-bundle

Directus bundle for allowing authenticated Studio users to inspect and trigger deployments for an
allow-listed set of Coolify applications. The bundle connects Directus to one Coolify instance;
Coolify credentials stay on the Directus server and Studio calls the authenticated Directus endpoint
rather than Coolify directly.

## Purpose and bundle entries

| Entry                               | Type           | Status   | Purpose                                                                                                                        |
| ----------------------------------- | -------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `coolify-deployments-endpoint`      | Endpoint       | Complete | Authenticated application and deployment API.                                                                                  |
| `coolify-deployments-module`        | Studio module  | Complete | Application, history, detail, polling, trigger, and cancellation views.                                                        |
| `coolify-deployments-hook`          | Hook           | Complete | Ensures the local collection, seeds policies, and enriches new records from Coolify.                                           |
| `coolify-deploy-operation`          | Flow operation | Complete | Uses an async Directus `VSelect` for deployable applications, rechecks the selected item, and triggers its Coolify deployment. |
| `coolify-deploy-application-select` | Interface      | Complete | Async Directus `VSelect` for the Flow operation's application item ID.                                                         |

The package does not install Coolify, create a token, provide build logs, persist deployment
history, or schedule deployments.

## Requirements and compatibility

- Directus `^12.2.0` and Node.js `>=24.10.0`.
- One reachable Coolify instance with the `/api/v1` API.
- A Coolify token with read and deploy access to the integrated applications.

## Installation

```sh
pnpm add @onderwijsin/directus-coolify-deployments-bundle
```

Install it in the Directus runtime image and restart Directus after installation. The bundle is
discovered automatically; consumers do not register each entry manually.

This bundle is distributed through npm for trusted Directus runtime installations. It is
non-sandboxed and is not eligible for installation from the Directus Marketplace.

```dockerfile
FROM directus/directus:12.2.0

USER root
RUN corepack enable \
  && pnpm add --dir /directus --save-exact \
    @onderwijsin/directus-coolify-deployments-bundle@0.1.0
USER node
```

Configure the environment before startup. The hook creates the collection and policies during
startup; wait for startup to finish before creating the first application.

## Configuration

`COOLIFY_URL` and `COOLIFY_TOKEN` are required whenever the bundle is enabled. Directus type-casts
environment values before the bundle validates them.

### Bundle settings

| Variable                               | Default                | Description                                                                    |
| -------------------------------------- | ---------------------- | ------------------------------------------------------------------------------ |
| `COOLIFY_DEPLOYMENTS_ENABLED`          | `true`                 | Master switch for all bundle entries.                                          |
| `COOLIFY_APPLICATIONS_COLLECTION`      | `coolify_applications` | Local allow-list collection. Must be a valid non-system collection name.       |
| `COOLIFY_URL`                          | —                      | Absolute base URL of one Coolify instance, e.g. `https://coolify.example.com`. |
| `COOLIFY_TOKEN`                        | —                      | Server-only bearer token sent to Coolify.                                      |
| `COOLIFY_DEPLOYMENTS_POLL_INTERVAL_MS` | `5000`                 | Studio polling interval in milliseconds; minimum `250`.                        |

### Schema and policy settings

| Variable                                            | Default                                | Description                                      |
| --------------------------------------------------- | -------------------------------------- | ------------------------------------------------ |
| `COOLIFY_DEPLOYMENTS_SCHEMA_CHANGES_ENABLED`        | `true`                                 | Enables this bundle's collection schema changes. |
| `COOLIFY_DEPLOYMENTS_SCHEMA_ABORT_ON_ERROR`         | `true`                                 | Aborts schema setup after an unexpected error.   |
| `DIRECTUS_EXTENSIONS_SCHEMA_CHANGES_ENABLED`        | `true`                                 | Global schema gate; must also be enabled.        |
| `DIRECTUS_EXTENSIONS_DATA_SEED_ENABLED`             | `true`                                 | Global policy/data seed gate.                    |
| `COOLIFY_DEPLOYMENTS_MANAGE_APPLICATIONS_POLICY_ID` | `0c9f0b1e-0a0b-4b7c-8a27-4b7a6e1f2d31` | UUID for local application CRUD/list access.     |
| `COOLIFY_DEPLOYMENTS_READ_DEPLOYMENTS_POLICY_ID`    | `2e7a4c63-1d5f-46bb-9b02-8f3c7a5d6e14` | UUID for deployment GET routes.                  |
| `COOLIFY_DEPLOYMENTS_TRIGGER_DEPLOYMENTS_POLICY_ID` | `7b3d9e20-5f61-4a8c-b274-1e6d9f0a3c58` | UUID for permission, deploy, and cancel routes.  |

When data seeding is enabled, the bundle creates or reconciles `Can manage Coolify applications`,
`Can read Coolify deployments`, and `Can trigger Coolify deployments`. It does not assign policies
to roles or users. The trigger policy intentionally has no nested collection permissions.

### Cache and Redis settings

Configured application records are cached for 60 seconds for reads. Deployment and cancellation
authorization bypasses this cache so changes to `enabled` and `deploy_enabled` take effect
immediately. Redis is intentionally shared across horizontally scaled Directus processes.

| Variable                                     | Default  | Description                                                                |
| -------------------------------------------- | -------- | -------------------------------------------------------------------------- |
| `CACHE_ENABLED`                              | `true`   | Enables the configured-application cache.                                  |
| `CACHE_STORE`                                | `memory` | `memory` is process-local; `redis` is shared.                              |
| `REDIS_ENABLED`                              | `false`  | Enables component-based Redis configuration.                               |
| `REDIS`                                      | —        | Complete `redis://` or `rediss://` URL; takes precedence over components.  |
| `REDIS_HOST`                                 | —        | Redis hostname when using components.                                      |
| `REDIS_PORT`                                 | —        | Redis port, `1`–`65535`, when using components.                            |
| `REDIS_USERNAME`                             | —        | Redis username when using components.                                      |
| `REDIS_PASSWORD`                             | —        | Redis password when using components.                                      |
| `DIRECTUS_POLICY_CACHE_INVALIDATION_ENABLED` | `true`   | Registers global policy-cache invalidation in this bundle's hook.          |
| `SYNCHRONIZATION_STORE`                      | `memory` | Global synchronization backend; separate from `CACHE_STORE`.               |
| `DIRECTUS_EXTENSIONS_LOCK_PROVIDER`          | —        | Optional startup lock provider: `memory`, `redis`, or `fs`.                |
| `DIRECTUS_EXTENSIONS_LOCK_REDIS_URL`         | —        | Required for a Redis lock provider unless another Redis URL is configured. |
| `DIRECTUS_EXTENSIONS_LOCK_FS_DIRECTORY`      | —        | Required for an `fs` lock provider.                                        |
| `DIRECTUS_EXTENSIONS_RATE_LIMITER_STORE`     | —        | Optional shared rate-limiter store: `memory` or `redis`.                   |

Use either a URL:

```dotenv
CACHE_ENABLED=true
CACHE_STORE=redis
REDIS=rediss://cache-user:secret@redis.example.com:6380
```

Or all four components:

```dotenv
CACHE_ENABLED=true
CACHE_STORE=redis
REDIS_ENABLED=true
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_USERNAME=default
REDIS_PASSWORD=secret
```

When `CACHE_STORE=redis`, `REDIS` or all four components are required. Partial configuration is
rejected during startup. Redis is recommended for multiple Directus instances; the cache is not a
deployment record store.

The bundle also uses the shared policy helpers for authorization checks. Policy results are cached
only when `CACHE_ENABLED=true` and valid Redis configuration is present, for up to three days, in
the isolated `directus:policies` namespace. The hook globally clears that namespace when
`directus_access`, `directus_policies`, or `directus_roles` changes. If the standalone policies
endpoint bundle is installed as well, set `DIRECTUS_POLICY_CACHE_INVALIDATION_ENABLED=false` in one
of the two extensions so only one invalidation hook is registered.

## Managed collection and allow-list

The default collection is `coolify_applications`; set `COOLIFY_APPLICATIONS_COLLECTION` to use a
different valid collection name. The bundle derives seeded policy permissions and Studio navigation
from that setting. Every field is non-null. The generated identifier and Coolify metadata are not
required in Studio, while `application_uuid` and the enablement flags remain required:

| Field                                   | Writable         | Description                                               |
| --------------------------------------- | ---------------- | --------------------------------------------------------- |
| `id`                                    | no               | Hidden Directus UUID primary key.                         |
| `application_uuid`                      | create or update | Unique Coolify application UUID.                          |
| `name`                                  | no               | Coolify application name.                                 |
| `project_uuid` / `project_name`         | no               | Coolify project metadata.                                 |
| `environment_uuid` / `environment_name` | no               | Coolify environment metadata.                             |
| `production_url`                        | no               | Coolify production FQDN.                                  |
| `enabled`                               | yes              | Initialized `true`; only enabled records are used.        |
| `deploy_enabled`                        | yes              | Initialized `true`; false blocks deploy/cancel mutations. |

Create an application using only its UUID:

```sh
curl -X POST "$DIRECTUS_URL/items/coolify_applications" \
  -H "Authorization: Bearer $DIRECTUS_TOKEN" \
  -H 'Content-Type: application/json' \
  --data '{"application_uuid":"your-coolify-application-uuid"}'
```

The create and update filters load the application from Coolify and fill all other fields. They
require a matching UUID, name, project UUID/name, environment UUID/name, and production URL. When
Coolify returns multiple comma-separated FQDNs, the first URL is stored. If Coolify is unavailable
or returns incomplete data, the write fails and no partial item is saved. Existing records are not
automatically refreshed when Coolify metadata changes unless `application_uuid` is included in an
update. Updates that include an `application_uuid` re-enrich the complete provider-managed metadata;
other direct updates to Coolify-managed metadata fields are rejected. Only `enabled` and
`deploy_enabled` may be changed without re-enrichment.

## Policies and security

Administrators bypass custom policy-assignment checks. Other authenticated users need the relevant
policy assigned to their user or effective role:

| Policy                            | Required for                          | Nested collection permissions      |
| --------------------------------- | ------------------------------------- | ---------------------------------- |
| `Can manage Coolify applications` | Listing applications and local CRUD   | CRUD on the configured collection. |
| `Can read Coolify deployments`    | Deployment GET routes                 | Read on the configured collection. |
| `Can trigger Coolify deployments` | Permission, deploy, and cancel routes | None; it is a remote feature gate. |

The endpoint checks authentication, same-origin requests, policy assignment, and the local
allow-list. Missing browser origin metadata remains supported for authenticated CLI and Flow
clients. Policy assignment honors Directus `policy.ip_access` restrictions. For proxy deployments,
Express must resolve trusted proxy headers; the endpoint does not trust client-supplied
`X-Forwarded-*` headers.

## API reference

Base path: `/coolify-deployments`. All routes return `X-Coolify-Deployments-Poll-Interval` with the
configured polling interval and return `503` while schema startup work is locked.

| Method | Route                                                                    | Policy          | Response                                                                                         |
| ------ | ------------------------------------------------------------------------ | --------------- | ------------------------------------------------------------------------------------------------ |
| `GET`  | `/coolify-deployments/permissions`                                       | Trigger         | `{ "canTrigger": true }`                                                                         |
| `GET`  | `/coolify-deployments/operation/applications`                            | Collection read | `[ { "id": "...", "name": "Frontend" } ]`; enabled and deploy-enabled items only.                |
| `GET`  | `/coolify-deployments/dashboard`                                         | Manage + Read   | One dashboard projection containing applications, active/recent deployments, and trigger access. |
| `GET`  | `/coolify-deployments/applications`                                      | Manage          | Application summary array.                                                                       |
| `GET`  | `/coolify-deployments/applications/:id/deployments`                      | Read            | Normalized deployment array.                                                                     |
| `GET`  | `/coolify-deployments/applications/:id/deployments/:deploymentId`        | Read            | One normalized deployment.                                                                       |
| `POST` | `/coolify-deployments/applications/:id/deployments`                      | Trigger         | `201 { "id": "deployment-uuid" }`. Always forces rebuild.                                        |
| `POST` | `/coolify-deployments/applications/:id/deployments/:deploymentId/cancel` | Trigger         | Cancellation result.                                                                             |

`:id` is the stable Directus item ID, not the Coolify application UUID. URL-encode route values.

### Permission check

```sh
curl "$DIRECTUS_URL/coolify-deployments/permissions" \
  -H "Authorization: Bearer $DIRECTUS_TOKEN"
```

```json
{ "canTrigger": true }
```

This is a policy check, not a Coolify health check.

### List applications

```sh
curl "$DIRECTUS_URL/coolify-deployments/applications" \
  -H "Authorization: Bearer $DIRECTUS_TOKEN"
```

```json
[
  {
    "directusApplicationId": "directus-item-uuid",
    "name": "Frontend",
    "url": "https://frontend.example.com",
    "projectName": "Website",
    "environmentName": "production",
    "state": "running",
    "gitBranch": "main",
    "gitCommitSha": "abc123",
    "gitRepository": "owner/frontend",
    "buildPack": "nixpacks",
    "serverName": "production-server",
    "latestDeployment": null
  }
]
```

### List and read deployments

```sh
curl "$DIRECTUS_URL/coolify-deployments/applications/$DIRECTUS_APPLICATION_ID/deployments" \
  -H "Authorization: Bearer $DIRECTUS_TOKEN"
```

Deployment objects have this shape:

```json
{
  "id": "deployment-uuid",
  "directusApplicationId": "directus-item-uuid",
  "coolifyApplicationId": "coolify-application-uuid",
  "applicationName": "Frontend",
  "environmentName": "production",
  "status": "ready",
  "rawStatus": "finished",
  "createdAt": "2026-08-20T10:00:00.000Z",
  "startedAt": "2026-08-20T10:00:00.000Z",
  "finishedAt": "2026-08-20T10:02:12.000Z",
  "duration": 132,
  "branch": null,
  "commitSha": "abc123",
  "commitMessage": "Deploy frontend",
  "url": "https://coolify.example.com/deployments/deployment-uuid",
  "coolifyUrl": "https://coolify.example.com/deployments/deployment-uuid",
  "triggeredBy": null
}
```

Normalized statuses are `queued`, `building`, `ready`, `error`, and `canceled`; `rawStatus` keeps
Coolify's original status. `duration` is seconds. Missing timestamps, URLs, branches, and users are
`null`. The detail route is:

```text
GET /coolify-deployments/applications/:id/deployments/:deploymentId
```

The deployment must belong to an allow-listed application.

### Trigger and cancel

```sh
curl -X POST "$DIRECTUS_URL/coolify-deployments/applications/$DIRECTUS_APPLICATION_ID/deployments" \
  -H "Authorization: Bearer $DIRECTUS_TOKEN" \
  -H 'Content-Type: application/json' \
  --data '{}'
```

Response:

```json
{ "id": "deployment-uuid" }
```

The request body is currently ignored; the server always sends `force=true` to Coolify. The
application must have `enabled=true` and `deploy_enabled=true`.

```sh
curl -X POST "$DIRECTUS_URL/coolify-deployments/applications/$DIRECTUS_APPLICATION_ID/deployments/$DEPLOYMENT_ID/cancel" \
  -H "Authorization: Bearer $DIRECTUS_TOKEN"
```

```json
{
  "message": "Deployment cancelled successfully.",
  "deploymentUuid": "deployment-uuid",
  "status": "cancelled-by-user"
}
```

### Errors

| HTTP  | Code                                                     | Meaning                                                                            |
| ----- | -------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `400` | `COOLIFY_INVALID_DEPLOYMENT_REQUEST`                     | Invalid deployment input.                                                          |
| `403` | Directus forbidden error                                 | Missing session/policy, failed origin check, or disallowed application/deployment. |
| `502` | `COOLIFY_UPSTREAM_FAILED`                                | Coolify unavailable, invalid, or incomplete response.                              |
| `503` | `COOLIFY_SCHEMA_LOCKED` / `COOLIFY_SCHEMA_STATUS_FAILED` | Schema work is active or readiness could not be checked.                           |
| `501` | `COOLIFY_NOT_IMPLEMENTED`                                | Reserved for an unimplemented capability.                                          |

Raw provider errors are logged server-side and normalized before reaching the client.

## Studio module

The `Deployments` module provides:

- the application dashboard;
- application deployment history;
- deployment detail;
- active-deployment polling;
- trigger controls when `/permissions` allows them; and
- cancellation controls for active deployments.

Its routes are `/coolify-deployments`, `/coolify-deployments/applications/:directusApplicationId`,
and `/coolify-deployments/applications/:directusApplicationId/deployments/:deploymentId`. It uses
the authenticated Directus endpoint and never exposes the Coolify token. The dashboard refresh uses
`GET /coolify-deployments/dashboard`, which returns application summaries plus bounded active and
recent deployment data in one response. Dashboard and detail polling never overlap, pause while the
tab is hidden, preserve rendered data during refresh, and use a slower 30-second cadence when no
deployment is active. The create-permission lookup is cached for the Studio session.

## Flow operation

`Coolify Deploy` has one `Application` option backed by the custom
`coolify-deploy-application-select` interface. The interface uses Directus' `VSelect` and loads
`GET /coolify-deployments/operation/applications` with the authenticated Studio session. That route
reads the configured applications collection with the current user's Directus read permissions and
returns only enabled, deploy-enabled item IDs and names. Loading, empty, and request-error states
are shown in the operation form. Users without read access cannot load the choices; they still need
the trigger policy to execute the operation.

The stored value remains the Directus item ID. At execution time the operation reads the selected
item again, rechecks both flags, and triggers a Coolify deployment for its `application_uuid`.
User-associated Flow executions also require the trigger policy; administrators bypass that check.
System-triggered executions without accountability are trusted automation. Disabled or
no-longer-deployable applications fail the flow.

Example:

```text
Operation: Coolify Deploy
Application: 6f4c2e9a-2ef4-4b4a-8e6a-application-item-id
```

Use the Directus item ID, not `application_uuid`. Connect the operation's reject path when a stale
or disabled selection should be handled explicitly.

## Troubleshooting

Keep the token in secret management and use least privilege. Assign the trigger policy only to
trusted deployers. Add rate limiting and audit logging around mutation routes when required.

If the collection is missing, verify `COOLIFY_DEPLOYMENTS_SCHEMA_CHANGES_ENABLED=true` and
`DIRECTUS_EXTENSIONS_SCHEMA_CHANGES_ENABLED=true`; enable data seeding separately with
`DIRECTUS_EXTENSIONS_DATA_SEED_ENABLED=true`. If startup validation fails, check the absolute URL,
non-empty token, UUID policy overrides, collection name, and complete Redis configuration. For
`403`, check authentication, origin, policy assignment, Directus item ID, `enabled`, and
`deploy_enabled`. For `502`, check Coolify reachability/token access/provider data. For `503`, wait
for schema startup work and inspect lock-provider configuration.

## Boundaries

This extension is non-sandboxed, so it does not carry the trust required for Directus Marketplace
distribution. Install it as an npm package in the Directus runtime. The startup hook creates or
reconciles the configured applications collection and, when data seeding is enabled, three policies
and their local permissions. It also enriches newly created application records from Coolify; it
does not alter unrelated collections, roles, or existing deployment records.

Consumers own Coolify infrastructure, token lifecycle, deployment image, secrets, policy
assignments, scheduling, retries, rate limits, audits, and alerting. The bundle owns only the
Directus-facing integration and normalized provider data. Requests to Coolify are bounded by a
30-second timeout.
