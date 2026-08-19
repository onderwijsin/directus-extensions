# @onderwijsin/directus-coolify-deployments-bundle

Trusted Directus extension bundle for authenticated Studio users and Flows to trigger and inspect
frontend deployments in Coolify.

The server endpoint, Coolify API client, minimal Studio diagnostic UI, and schema-management hook
are implemented. The Flow operation remains scaffold-only until its operation wiring is completed.

## Surface

- `Coolify deployments` Studio module for project overview and deployment history;
- authenticated application-specific endpoint under `/coolify-deployments`;
- `Coolify Deploy` Flow operation with `project` and `force` inputs; and
- `coolify_applications` configuration collection managed by the startup hook; and
- a server-only Coolify adapter with normalized deployment models.

The Studio will not communicate with Coolify directly. Coolify credentials and configured project
UUIDs will remain server-side.

The bundle currently integrates with a single Coolify instance, configured through one
`COOLIFY_URL`. The associated `COOLIFY_TOKEN` must have read and deploy access for every Coolify
application or project integrated through the Deployments module. Per-application Coolify API tokens
are not currently supported.

## Installation

```sh
pnpm add @onderwijsin/directus-coolify-deployments-bundle
```

The bundle is non-sandboxed and requires a trusted Directus runtime. The module currently exposes
project, deployment-history, and deployment-detail views with raw JSON diagnostics for integration
testing. The Flow operation still displays scaffold-only messaging.

## Configuration

The package reserves these Directus environment variables:

| Variable                          | Description                                                                                       |
| --------------------------------- | ------------------------------------------------------------------------------------------------- |
| `COOLIFY_DEPLOYMENTS_ENABLED`     | Enables the bundle; defaults to `true`.                                                           |
| `COOLIFY_APPLICATIONS_COLLECTION` | Collection for allow-listed Coolify applications; defaults to `coolify_applications`.             |
| `COOLIFY_URL`                     | Base URL of the Coolify instance.                                                                 |
| `COOLIFY_TOKEN`                   | Server-only Coolify API token.                                                                    |
| `COOLIFY_PROJECTS`                | Configured frontend projects with stable IDs, names, production URLs, and Coolify resource UUIDs. |

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
startup. It contains the allow-listed application UUID, display metadata, optional project and
environment metadata, and deployment enablement flags. Schema setup uses the shared schema-change
lock, and endpoint routes return `503` while this bundle's schema is being changed.

This phase only manages the collection schema. The existing endpoint configuration still uses
`COOLIFY_PROJECTS`; wiring endpoint reads to `coolify_applications` is the next phase.

Schema changes can be controlled with `COOLIFY_DEPLOYMENTS_SCHEMA_CHANGES_ENABLED` and
`COOLIFY_DEPLOYMENTS_SCHEMA_ABORT_ON_ERROR`, in addition to the global schema-change and lock
settings documented by `@onderwijsin/directus-extension-utils`.

## Endpoint

All routes require an authenticated Directus session. The endpoint resolves the `:id` route
parameter against `COOLIFY_PROJECTS`; arbitrary Coolify application UUIDs are rejected. The deploy
mutation also rejects browser requests whose `Origin` or `Referer` does not match the Directus
origin. Requests without browser origin metadata remain supported for authenticated Flow and
command-line clients; this check is defense in depth, not a replacement for Directus permissions.

| Method | Route                                                         | Description                                                                                           |
| ------ | ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `GET`  | `/coolify-deployments/projects`                               | List configured projects without Coolify UUIDs.                                                       |
| `GET`  | `/coolify-deployments/projects/:id/deployments`               | List application deployments. Supports `skip` (default `0`) and `take` (default `10`, maximum `100`). |
| `GET`  | `/coolify-deployments/projects/:id/deployments/:deploymentId` | Read one deployment by Coolify deployment UUID.                                                       |
| `POST` | `/coolify-deployments/projects/:id/deploy`                    | Trigger a deployment. Body is `{ "force": true }`; force defaults to `true`.                          |

Responses use the extension-owned normalized model with `status`, `rawStatus`, commit metadata,
deployment URL, timestamps, duration, and the stable configured project ID. Coolify failures are
logged server-side and returned as a generic `502` response.

For production use, grant the deploy route only to a dedicated Directus permission or role, use a
least-privilege Coolify token, keep the Coolify URL fixed in server configuration, and add rate
limiting and audit logging at the deployment boundary.

## Boundaries

The package does not install or configure Coolify, create Directus policies, persist deployment
records, implement scheduling, show build logs, or provide cancellation. Directus Flows will own
scheduled and conditional automation once the Flow operation is implemented.
