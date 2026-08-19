---
name: directus-coolify-deployments-bundle
description: Configure and operate the Coolify deployments bundle in a trusted Directus runtime.
---

# Directus Coolify deployments bundle

`@onderwijsin/directus-coolify-deployments-bundle` is a Directus bundle for triggering and
inspecting frontend deployments in Coolify from Studio and Flows.

The endpoint, server-side Coolify client, minimal Studio diagnostic views, and schema-management
hook are implemented. The Flow operation remains scaffold-only.

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

| Variable                                     | Required         | Default                | Description                                                     |
| -------------------------------------------- | ---------------- | ---------------------- | --------------------------------------------------------------- |
| `COOLIFY_DEPLOYMENTS_ENABLED`                | no               | `true`                 | Enables the bundle entries.                                     |
| `COOLIFY_APPLICATIONS_COLLECTION`            | no               | `coolify_applications` | Allow-listed applications collection.                           |
| `COOLIFY_DEPLOYMENTS_SCHEMA_CHANGES_ENABLED` | no               | `true`                 | Enables this bundle's schema changes.                           |
| `COOLIFY_DEPLOYMENTS_SCHEMA_ABORT_ON_ERROR`  | no               | `true`                 | Aborts schema setup after an unexpected error.                  |
| `COOLIFY_URL`                                | yes when enabled | —                      | Base URL of the Coolify instance.                               |
| `COOLIFY_TOKEN`                              | yes when enabled | —                      | Server-only least-privilege Coolify API token.                  |
| `COOLIFY_PROJECTS`                           | no               | `[]`                   | JSON/Directus array of configured frontend project definitions. |

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

The endpoint is usable by authenticated clients. The module provides diagnostic project,
deployment-history, and deployment-detail views; the Flow operation still returns scaffold-only “not
implemented yet” behavior.

The `coolify-deployments-hook` entry creates the allow-listed applications collection at startup. It
uses the shared schema-change lock; endpoint routes return `503` while the collection schema is
being ensured. This phase only manages the collection schema; endpoint reads still use the legacy
`COOLIFY_PROJECTS` configuration until the next phase wires them to `coolify_applications`.

## Endpoint behavior

All endpoint routes require an authenticated Directus session. Configured project IDs are resolved
server-side to Coolify resource UUIDs; callers cannot submit arbitrary Coolify UUIDs.

The deploy mutation also checks browser `Origin` or `Referer` metadata against the Directus origin.
Missing browser origin metadata is allowed for authenticated non-browser clients. Treat this as CSRF
defense in depth: configure a dedicated Directus permission for deployment mutations and do not rely
on same-origin checking as authorization.

| Method | Route                                                         | Behavior                                                                   |
| ------ | ------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `GET`  | `/coolify-deployments/projects`                               | Returns configured project IDs, names, and production URLs.                |
| `GET`  | `/coolify-deployments/projects/:id/deployments`               | Lists application deployments; accepts `skip` and `take` query parameters. |
| `GET`  | `/coolify-deployments/projects/:id/deployments/:deploymentId` | Returns one normalized deployment.                                         |
| `POST` | `/coolify-deployments/projects/:id/deploy`                    | Triggers a deployment with `{ "force": true }` by default.                 |

The client calls Coolify's `/api/v1` deployment endpoints with a server-side bearer token. Coolify
responses are validated with Zod and normalized to the extension model. Provider failures return a
generic `502` response while details are logged by Directus.

## Security and ownership model

The implementation keeps Coolify credentials server-side, authenticates endpoint requests with the
active Directus session, and validates normalized responses before returning them. Configure a
dedicated Directus capability for triggering a deployment. The package resolves stable project IDs
to configured Coolify resource UUIDs.

Directus Flows, rather than this package, will own scheduled and conditional automation. The bundle
will not add a scheduler or condition engine.

## Boundaries

The bundle does not provide status polling, logs, cancellation, retry, persistence, per-project
permissions, or Coolify configuration management.
