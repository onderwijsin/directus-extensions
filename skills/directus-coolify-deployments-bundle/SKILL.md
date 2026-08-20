---
name: directus-coolify-deployments-bundle
description: Configure and operate the Coolify deployments bundle in Directus.
---

# Directus Coolify deployments bundle

Use this skill when installing, configuring, operating, or integrating
`@onderwijsin/directus-coolify-deployments-bundle`.

This bundle mediates between Directus and one Coolify instance. It allow-lists applications in a
Directus collection, displays their current state in Studio, and exposes authenticated routes for
reading, triggering, and cancelling deployments. Coolify credentials stay on the server.

The Flow operation accepts a Directus application item ID, rechecks that the record is enabled and
deploy-enabled, and triggers its Coolify deployment. Credentials stay on the server.

## Prerequisites and installation

- Directus `^12.2.0` and Node.js `>=24.10.0`.
- One reachable Coolify instance exposing `/api/v1`.
- A Coolify bearer token with read and deploy access to integrated applications.
- Extension schema changes enabled during initial setup.

Install in the Directus project or runtime image, then restart Directus:

```sh
pnpm add @onderwijsin/directus-coolify-deployments-bundle
```

```dockerfile
FROM directus/directus:12.2.0

USER root
RUN corepack enable \
  && pnpm add --dir /directus --save-exact \
    @onderwijsin/directus-coolify-deployments-bundle@0.1.0
USER node
```

The bundle is discovered automatically. It does not install Coolify, provision tokens, or create
consumer deployment infrastructure.

## Configuration reference

### Core settings

| Variable                               | Default                | Requirement / effect                                                                |
| -------------------------------------- | ---------------------- | ----------------------------------------------------------------------------------- |
| `COOLIFY_DEPLOYMENTS_ENABLED`          | `true`                 | Boolean master switch.                                                              |
| `COOLIFY_APPLICATIONS_COLLECTION`      | `coolify_applications` | Valid collection identifier; cannot start with `directus_`.                         |
| `COOLIFY_URL`                          | unset                  | Absolute URL for one Coolify instance. Do not append `/api/v1`; the bundle adds it. |
| `COOLIFY_TOKEN`                        | unset                  | Non-empty server-only token sent as a bearer token.                                 |
| `COOLIFY_DEPLOYMENTS_POLL_INTERVAL_MS` | `5000`                 | Integer minimum `250`; also emitted as `X-Coolify-Deployments-Poll-Interval`.       |

Example:

```dotenv
COOLIFY_DEPLOYMENTS_ENABLED=true
COOLIFY_URL=https://coolify.example.com
COOLIFY_TOKEN=server-only-secret
COOLIFY_DEPLOYMENTS_POLL_INTERVAL_MS=5000
```

### Schema and policies

| Variable                                            | Default                                | Effect                                                |
| --------------------------------------------------- | -------------------------------------- | ----------------------------------------------------- |
| `COOLIFY_DEPLOYMENTS_SCHEMA_CHANGES_ENABLED`        | `true`                                 | Bundle-local collection schema gate.                  |
| `COOLIFY_DEPLOYMENTS_SCHEMA_ABORT_ON_ERROR`         | `true`                                 | Abort behavior after unexpected schema/policy errors. |
| `DIRECTUS_EXTENSIONS_SCHEMA_CHANGES_ENABLED`        | `true`                                 | Global schema gate; both gates must be enabled.       |
| `DIRECTUS_EXTENSIONS_DATA_SEED_ENABLED`             | `true`                                 | Global policy/data seed gate.                         |
| `COOLIFY_DEPLOYMENTS_MANAGE_APPLICATIONS_POLICY_ID` | `0c9f0b1e-0a0b-4b7c-8a27-4b7a6e1f2d31` | UUID for manage/list access.                          |
| `COOLIFY_DEPLOYMENTS_READ_DEPLOYMENTS_POLICY_ID`    | `2e7a4c63-1d5f-46bb-9b02-8f3c7a5d6e14` | UUID for deployment GET access.                       |
| `COOLIFY_DEPLOYMENTS_TRIGGER_DEPLOYMENTS_POLICY_ID` | `7b3d9e20-5f61-4a8c-b274-1e6d9f0a3c58` | UUID for permission/deploy/cancel access.             |

Data seeding creates `Can manage Coolify applications`, `Can read Coolify deployments`, and
`Can trigger Coolify deployments`; it does not assign them to roles. The trigger policy has no
nested collection permissions because it gates remote operations.

### Cache and Redis

Configured application records are cached for 60 seconds for reads. Deployment and cancellation
authorization bypasses this cache so changes to `enabled` and `deploy_enabled` take effect
immediately. Redis is intentionally shared across horizontally scaled Directus processes.

| Variable                                 | Default                | Valid values / effect                                                       |
| ---------------------------------------- | ---------------------- | --------------------------------------------------------------------------- |
| `CACHE_ENABLED`                          | `true` for this bundle | Boolean cache switch.                                                       |
| `CACHE_STORE`                            | `memory`               | `memory` or `redis`. Memory is per process.                                 |
| `REDIS_ENABLED`                          | `false`                | Enables component-based Redis configuration.                                |
| `REDIS`                                  | unset                  | Complete `redis://` or `rediss://` URL; takes precedence.                   |
| `REDIS_HOST`                             | unset                  | Component hostname.                                                         |
| `REDIS_PORT`                             | unset                  | Component port, `1`–`65535`.                                                |
| `REDIS_USERNAME`                         | unset                  | Component username.                                                         |
| `REDIS_PASSWORD`                         | unset                  | Component password.                                                         |
| `SYNCHRONIZATION_STORE`                  | `memory`               | Global synchronization fallback, separate from `CACHE_STORE`.               |
| `DIRECTUS_EXTENSIONS_LOCK_PROVIDER`      | unset                  | Optional `memory`, `redis`, or `fs` startup lock provider.                  |
| `DIRECTUS_EXTENSIONS_LOCK_REDIS_URL`     | unset                  | Required if the effective lock provider is Redis without another Redis URL. |
| `DIRECTUS_EXTENSIONS_LOCK_FS_DIRECTORY`  | unset                  | Required if the effective lock provider is `fs`.                            |
| `DIRECTUS_EXTENSIONS_RATE_LIMITER_STORE` | unset                  | Optional `memory` or `redis` shared utility setting.                        |

Use a URL:

```dotenv
CACHE_ENABLED=true
CACHE_STORE=redis
REDIS=rediss://cache-user:secret@redis.example.com:6380
```

Or all components:

```dotenv
CACHE_ENABLED=true
CACHE_STORE=redis
REDIS_ENABLED=true
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_USERNAME=default
REDIS_PASSWORD=secret
```

If any Redis component is supplied, all four are required. `CACHE_STORE=redis` requires a URL or all
components. Use Redis for multiple Directus processes.

## Configure applications

The startup hook ensures `coolify_applications` (or the configured collection). Fields are required
and non-null:

| Field                                                                                            | Input       | Behavior                                                     |
| ------------------------------------------------------------------------------------------------ | ----------- | ------------------------------------------------------------ |
| `id`                                                                                             | none        | Hidden Directus UUID primary key.                            |
| `application_uuid`                                                                               | create only | Unique Coolify application UUID.                             |
| `name`, `project_uuid`, `project_name`, `environment_uuid`, `environment_name`, `production_url` | none        | Loaded from Coolify and read-only.                           |
| `enabled`                                                                                        | writable    | Defaults true; false removes the record from endpoint reads. |
| `deploy_enabled`                                                                                 | writable    | Defaults true; false blocks deploy and cancel mutations.     |

Create with only the UUID:

```ts
const result = await fetch(`${directusUrl}/items/coolify_applications`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${directusToken}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ application_uuid: coolifyApplicationUuid }),
})

if (!result.ok) throw new Error(await result.text())
```

The create filter fetches Coolify with an initial allow-list bypass, verifies the UUID, and requires
name, project UUID/name, environment UUID/name, and an HTTP(S) production URL. If Coolify returns
multiple comma-separated FQDNs, only the first URL is stored. An unavailable, incomplete, or unsafe
provider response rejects the item without saving partial data. Existing records are not refreshed
automatically. Updates to `application_uuid` and other Coolify-managed metadata fields are rejected;
after creation, only `enabled` and `deploy_enabled` may be changed.

## Bundle entries

### Endpoint: `coolify-deployments-endpoint`

Base path: `/coolify-deployments`. Every route requires an authenticated Directus user, rejects a
cross-origin browser request, permits clients without origin metadata, sets the polling header, and
rejects while schema startup work is locked. Administrators bypass policy assignment checks.

| Method | Route                                                                    | Required policy | Result                                                    |
| ------ | ------------------------------------------------------------------------ | --------------- | --------------------------------------------------------- |
| `GET`  | `/coolify-deployments/permissions`                                       | Trigger         | `{ "canTrigger": true }`.                                 |
| `GET`  | `/coolify-deployments/applications`                                      | Manage          | Application summary array.                                |
| `GET`  | `/coolify-deployments/applications/:id/deployments`                      | Read            | Normalized deployment array.                              |
| `GET`  | `/coolify-deployments/applications/:id/deployments/:deploymentId`        | Read            | One normalized deployment.                                |
| `POST` | `/coolify-deployments/applications/:id/deployments`                      | Trigger         | `201 { "id": "deployment-uuid" }`; always forces rebuild. |
| `POST` | `/coolify-deployments/applications/:id/deployments/:deploymentId/cancel` | Trigger         | Cancellation result.                                      |

`:id` is the Directus item ID, not the Coolify application UUID. URL-encode route values.

Permission check:

```sh
curl "$DIRECTUS_URL/coolify-deployments/permissions" \
  -H "Authorization: Bearer $DIRECTUS_TOKEN"
```

List applications:

```sh
curl "$DIRECTUS_URL/coolify-deployments/applications" \
  -H "Authorization: Bearer $DIRECTUS_TOKEN"
```

Application summary:

```json
{
  "id": "directus-item-uuid",
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
```

Deployment list/detail objects:

```json
{
  "id": "deployment-uuid",
  "applicationId": "coolify-application-uuid",
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

Normalized statuses are `queued`, `building`, `ready`, `error`, and `canceled`. `rawStatus` keeps
Coolify's status. Duration is seconds and unavailable values are `null`. Deployment reads verify
that the deployment belongs to an allow-listed application.

Trigger and cancel:

```ts
const deployResponse = await fetch(
  `${directusUrl}/coolify-deployments/applications/${encodeURIComponent(itemId)}/deployments`,
  { method: 'POST', headers: { Authorization: `Bearer ${directusToken}` }, body: '{}' },
)
const { id: deploymentId } = await deployResponse.json()

await fetch(
  `${directusUrl}/coolify-deployments/applications/${encodeURIComponent(itemId)}/deployments/${encodeURIComponent(deploymentId)}/cancel`,
  { method: 'POST', headers: { Authorization: `Bearer ${directusToken}` } },
)
```

The deploy body is currently ignored and `force=true` is sent to Coolify. Both mutations require the
trigger policy and `deploy_enabled=true`.

Errors:

| HTTP  | Code                                                     | Action                                                        |
| ----- | -------------------------------------------------------- | ------------------------------------------------------------- |
| `400` | `COOLIFY_INVALID_DEPLOYMENT_REQUEST`                     | Correct input.                                                |
| `403` | Directus forbidden                                       | Check session, origin, policy, item ID, and allow-list gates. |
| `502` | `COOLIFY_UPSTREAM_FAILED`                                | Check Coolify URL, token, access, reachability, and response. |
| `503` | `COOLIFY_SCHEMA_LOCKED` / `COOLIFY_SCHEMA_STATUS_FAILED` | Retry after schema work or inspect startup logs.              |
| `501` | `COOLIFY_NOT_IMPLEMENTED`                                | Capability is not implemented.                                |

Raw provider errors are logged by Directus and normalized before reaching consumers.

### Studio module: `coolify-deployments-module`

The `Deployments` module provides the dashboard, application history, deployment detail, active
deployment polling, trigger controls, and cancellation controls. Routes are:

```text
/coolify-deployments
/coolify-deployments/applications/:applicationId
/coolify-deployments/applications/:applicationId/deployments/:deploymentId
```

It calls the Directus endpoint with the authenticated Studio session, reads the polling interval
from `X-Coolify-Deployments-Poll-Interval`, and never exposes `COOLIFY_TOKEN` in the browser.

### Startup hook: `coolify-deployments-hook`

The hook reconciles the collection schema and policies and registers the create filter. It does not
assign policies, refresh existing records, create Coolify resources, or persist deployment history.

### Flow operation: `coolify-deploy-operation`

`Coolify Deploy` exposes one `Application` text option. Enter the Directus item ID from the
configured applications collection. The operation re-reads the selected record when the flow runs,
checks both flags again, and calls Coolify's deployment API with that record's `application_uuid`.
User-associated executions require the trigger policy; administrators bypass that check. System-
triggered executions without accountability are trusted automation. This supports custom application
collection names.

The operation returns Coolify's deployment trigger result on the resolve path. It throws a forbidden
error when the selected record is missing or either flag is false, so connect a reject path when the
flow should handle a stale or disabled selection explicitly.

## Security and operations

Keep the token in secret management and use least privilege. Assign the trigger policy only to
trusted deployers. Policy assignment honors `policy.ip_access`. Configure Express to resolve trusted
proxy headers; the endpoint does not trust client-supplied `X-Forwarded-*` headers. Add rate
limiting, audit logging, retries, and alerting at the consumer boundary when required.

The server client restricts provider reads to UUIDs found in enabled local records. It fetches
deployment history in pages of 100 and does not copy it into Directus. The cache is only a 60-second
configuration cache, not a deployment store.

## Troubleshooting

If the collection is missing, check:

```dotenv
COOLIFY_DEPLOYMENTS_SCHEMA_CHANGES_ENABLED=true
DIRECTUS_EXTENSIONS_SCHEMA_CHANGES_ENABLED=true
DIRECTUS_EXTENSIONS_DATA_SEED_ENABLED=true
```

For validation failures, check the absolute URL, non-empty token, UUID policy overrides, collection
name, and complete Redis configuration. For `403`, check authentication, origin, policy assignment,
Directus item ID, `enabled`, and `deploy_enabled`. For `502`, check Coolify reachability and token
access. For `503`, wait for startup/schema work and inspect the configured lock provider.

## Boundaries

This extension is non-sandboxed, so it does not carry the trust required for Directus Marketplace
distribution. Install it as an npm package in the Directus runtime. The startup hook creates or
reconciles the configured applications collection and, when data seeding is enabled, three policies
and their local permissions. It enriches new application records from Coolify, but does not modify
unrelated collections, roles, or deployment records.

Consumers own Coolify infrastructure, token lifecycle, deployment image, secrets, assignments,
scheduling, retries, rate limits, audit, and alerting. The bundle owns only the Directus-facing
integration and normalized provider data. Requests to Coolify are bounded by a 30-second timeout.
