# @onderwijsin/directus-coolify-deployments-bundle

Trusted Directus extension bundle for authenticated Studio users and Flows to trigger and inspect
frontend deployments in Coolify.

The server endpoint, Coolify API client, native-style Studio module, and schema-management hook are
implemented. The Flow operation remains scaffold-only until its operation wiring is completed.

## Surface

- `Coolify deployments` Studio module for application overview, deployment history, polling, and
  cancellation;
- authenticated application-specific endpoint under `/coolify-deployments`;
- `Coolify Deploy` Flow operation with `project` and `force` inputs; and
- `coolify_applications` configuration collection managed by the startup hook; and
- a server-only Coolify adapter with normalized deployment models.

The Studio will not communicate with Coolify directly. Coolify credentials and configured
application UUIDs will remain server-side.

The bundle currently integrates with a single Coolify instance, configured through one
`COOLIFY_URL`. The associated `COOLIFY_TOKEN` must have read and deploy access for every Coolify
application or project integrated through the Deployments module. Per-application Coolify API tokens
are not currently supported.

## Installation

```sh
pnpm add @onderwijsin/directus-coolify-deployments-bundle
```

The bundle is non-sandboxed and requires a trusted Directus runtime. The module exposes dashboard,
application history, and deployment-detail views. The Flow operation still displays scaffold-only
messaging.

## Configuration

The package reserves these Directus environment variables:

| Variable                                                       | Description                                                                                       |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `COOLIFY_DEPLOYMENTS_ENABLED`                                  | Enables the bundle; defaults to `true`.                                                           |
| `COOLIFY_APPLICATIONS_COLLECTION`                              | Collection for allow-listed Coolify applications; defaults to `coolify_applications`.             |
| `COOLIFY_URL`                                                  | Base URL of the Coolify instance.                                                                 |
| `COOLIFY_TOKEN`                                                | Server-only Coolify API token.                                                                    |
| `COOLIFY_PROJECTS`                                             | Configured frontend projects with stable IDs, names, production URLs, and Coolify resource UUIDs. |
| `CACHE_ENABLED`                                                | Enables caching of configured application records; defaults to `true`.                            |
| `SYNCHRONIZATION_STORE`                                        | Directus synchronization backend; unrelated to cache selection.                                   |
| `CACHE_STORE`                                                  | Cache backend: `memory` or `redis`; defaults to `memory` when unset.                              |
| `REDIS_ENABLED`                                                | Enables component-based Redis configuration; defaults to `false`.                                 |
| `REDIS`                                                        | Complete Redis URL; takes precedence over component values.                                       |
| `REDIS_HOST`, `REDIS_PORT`, `REDIS_USERNAME`, `REDIS_PASSWORD` | Required together for component-based Redis.                                                      |
| `COOLIFY_DEPLOYMENTS_MANAGE_APPLICATIONS_POLICY_ID`            | UUID for the local application-management policy; has a stable default.                           |
| `COOLIFY_DEPLOYMENTS_READ_DEPLOYMENTS_POLICY_ID`               | UUID for the deployment-read policy; has a stable default.                                        |
| `COOLIFY_DEPLOYMENTS_TRIGGER_DEPLOYMENTS_POLICY_ID`            | UUID for the deployment-trigger policy; has a stable default.                                     |
| `COOLIFY_DEPLOYMENTS_POLL_INTERVAL_MS`                         | Studio polling interval in milliseconds; defaults to `5000` and must be at least `250`.           |

Example shape for `COOLIFY_PROJECTS`:

```json
[
  {
    "id": "onderwijsloket",
    "name": "Onderwijsloket",
    "productionUrl": "https://onderwijsloket.example.com",
    "resourceUuid": "coolify-resource-uuid"
  }
]
```

Coolify requests use `Authorization: Bearer <COOLIFY_TOKEN>` and the `/api/v1` API prefix. The
configured `resourceUuid` is never accepted from a request and is never returned by the projects
route.

## Schema management

The `coolify-deployments-hook` entry creates the configured applications collection at Directus
startup. It contains the allow-listed application UUID, display metadata, required project and
environment metadata, and deployment enablement flags. Schema setup uses the shared schema-change
lock, and endpoint routes return `503` while this bundle's schema is being changed.

Every field in the managed collection is required and non-nullable, including the production URL.

The server-side client reads configured applications from `coolify_applications` with administrative
accountability and caches the records for 60 seconds. `COOLIFY_PROJECTS` remains for legacy startup
configuration while the domain routes are being refactored.

Schema changes can be controlled with `COOLIFY_DEPLOYMENTS_SCHEMA_CHANGES_ENABLED` and
`COOLIFY_DEPLOYMENTS_SCHEMA_ABORT_ON_ERROR`, in addition to the global schema-change and lock
settings documented by `@onderwijsin/directus-extension-utils`.

When data seeding is enabled, startup also creates three policies:
`Can manage Coolify applications`, `Can read Coolify deployments`, and
`Can trigger Coolify deployments`. Policy UUIDs can be overridden with the three policy ID variables
above. Their nested permission definitions are also seeded into `directus_permissions`. Directus
generates integer permission IDs; the bundle ensures permissions by `policy + collection + action`
and does not require stable permission IDs. Only the local `coolify_applications` collection is
represented by nested permissions. The deployment policies are feature gates for remote Coolify
resources; `Can trigger Coolify deployments` intentionally has no nested permissions.

## Endpoint

All routes require an authenticated Directus session, pass the same-origin check, and require the
policy shown below. Administrators bypass the policy assignment check. Requests without browser
origin metadata remain supported for authenticated Flow and command-line clients. The routes resolve
stable Directus application IDs and return normalized application/deployment data.

| Method | Route                                                                    | Description                      |
| ------ | ------------------------------------------------------------------------ | -------------------------------- |
| `GET`  | `/coolify-deployments/applications`                                      | List configured applications.    |
| `GET`  | `/coolify-deployments/permissions`                                       | Check deployment trigger access. |
| `GET`  | `/coolify-deployments/applications/:id/deployments`                      | List deployments.                |
| `GET`  | `/coolify-deployments/applications/:id/deployments/:deploymentId`        | Read one deployment.             |
| `POST` | `/coolify-deployments/applications/:id/deployments`                      | Trigger a deployment.            |
| `POST` | `/coolify-deployments/applications/:id/deployments/:deploymentId/cancel` | Cancel a deployment.             |

Authentication, same-origin, and schema-lock failures are forwarded through Directus's error
middleware.

The endpoint resolves policy assignments from `directus_access` for the requesting user and
Directus's already-resolved effective role list, including public assignments when no effective
roles are present. This mirrors Directus policy assignment resolution but intentionally does not
evaluate `policy.ip_access` against the request IP. IP-based filtering is out of scope for this
iteration and is marked as a TODO in the helper.

For production use, grant the deploy route only to a dedicated Directus permission or role, use a
least-privilege Coolify token, keep the Coolify URL fixed in server configuration, and add rate
limiting and audit logging at the deployment boundary.

## Boundaries

The package does not install or configure Coolify, create Directus policies, persist deployment
records, implement scheduling, or show build logs. Directus Flows will own scheduled and conditional
automation once the Flow operation is implemented.
