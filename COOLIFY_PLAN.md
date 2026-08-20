# Coolify Deployments plan — v2

This document records the current direction for the Coolify deployments bundle. It is the v2
follow-up to [issue #27](https://github.com/onderwijsin/directus-extensions/issues/27), and should
be updated as the implementation moves from the current scaffold toward the domain model below.

## Product direction

The bundle provides a Directus-native way to inspect and trigger deployments for frontend
applications managed by Coolify.

For non-technical users, the module is called **Deployments**. Maintainers and developer-facing
documentation call the integration **Coolify deployments**. The Flow operation remains **Coolify
Deploy**.

The first useful version should focus on selecting and deploying configured applications. Projects
and environments are important context, but they are not themselves deployable resources.

## Domain model

Coolify's hierarchy and the bundle's responsibility are deliberately separate:

```text
Project       Human-facing grouping and name
  └─ Environment  Deployment context, such as production or staging
       └─ Application  Deployable service/frontend application
            └─ Deployment  An execution or deployment-history record
```

### Project

A Coolify project groups applications and other resources such as databases, workers, and services.
Its main value to this extension is presentation: projects usually have the name people recognize.
Projects are not deployment targets.

The provider identity is the Coolify project UUID. The bundle may use project metadata for labels,
navigation, discovery, and filtering, but must not infer that a project UUID can be passed to the
deploy endpoint as an application UUID.

### Environment

An environment belongs to a project and describes deployment context, for example `production`,
`staging`, or a preview environment. Environment support is initially optional, but the model must
leave room for multiple environments without changing the application identity.

The provider identity is the Coolify environment UUID. The environment name is useful for display,
configuration, and future selection.

### Application

An application is the primary deployable entity. It has its own Coolify application UUID and belongs
to an environment. Application configuration is managed in Directus through the
`coolify_applications` collection rather than through a complex JSON environment variable.

The extension's stable local identifier is used by Studio and Flows. The Coolify application UUID is
resolved server-side and is never accepted as an unvalidated deployment target from a caller.

The intended shape is:

```ts
interface CoolifyApplication {
  id: string
  name: string
  applicationUuid: string
  projectName: string | null
  projectUuid: string | null
  environmentName: string | null
  environmentUuid: string | null
  productionUrl: string | null
  deploymentsEnabled: boolean
}
```

The exact Directus field set may evolve, but `applicationUuid` must remain distinct from project and
environment identifiers.

### Deployment

A deployment is an execution/history record for an application. It is not the same shape as an
application response. The normalized bundle model should contain stable status and execution
metadata while retaining the provider status for diagnostics:

```ts
interface Deployment {
  id: string
  applicationId: string
  status: 'queued' | 'running' | 'success' | 'failed' | 'cancelled' | 'unknown'
  rawStatus: string
  commitSha: string | null
  commitMessage: string | null
  deploymentUrl: string | null
  startedAt: string | null
  finishedAt: string | null
  duration: number | null
}
```

## Coolify API mapping

The client should model the documented API response for each endpoint instead of deriving a model
from endpoint names:

| Concern                       | Coolify API role                     | Bundle role                                      |
| ----------------------------- | ------------------------------------ | ------------------------------------------------ |
| Project discovery             | List/get projects                    | Provide names and grouping metadata              |
| Environment discovery         | List/get project environments        | Resolve optional deployment context              |
| Application discovery         | List/get applications                | Identify deployable applications                 |
| Application deployment lookup | List deployments by application UUID | Verify response shape before using it as history |
| Running deployments           | List deployments                     | Show current execution state                     |
| Deployment detail             | Get deployment by UUID               | Normalize one execution record                   |
| Deployment mutation           | Deploy by tag or UUID                | Trigger an allow-listed application deployment   |

The application-deployment endpoint must not be parsed as a deployment-history response until its
documented application-shaped response is reconciled with live-provider behavior. The client should
keep application schemas and deployment schemas separate.

The intended client surface is close to:

```ts
listProjects()
getProject(projectUuid)
listEnvironments(projectUuid)
getEnvironment(projectUuid, environmentUuidOrName)
listApplications(filter?)
getApplication(applicationUuid)
listApplicationDeployments(applicationUuid)
listRunningDeployments()
getDeployment(deploymentUuid)
deploy({ uuid?, tag?, force?, pr? })
```

The extension may expose fewer methods at first, but each method should have one provider concept
and one response schema.

## Configuration and ownership

Phase 1 supports one Coolify instance per Directus installation:

- `COOLIFY_URL` identifies the single provider instance.
- `COOLIFY_TOKEN` is server-only and must have read and deploy access for every integrated project
  or application.
- Per-application Coolify API tokens are not supported.
- Directus owns the application allow-list and display configuration.
- Coolify remains the source of truth for project, environment, application, and deployment data.

The `coolify_applications` collection is the intended configuration boundary because complex
application settings are poor developer experience when encoded in one environment variable. The
collection should hold references and user-facing metadata, not duplicate all Coolify application
configuration.

## Current implementation state

The bundle uses `coolify_applications` as its Directus-owned allow-list and exposes authenticated
application, deployment, Studio, hook, and Flow-operation surfaces. Provider UUIDs are resolved
server-side. Legacy `COOLIFY_PROJECTS` configuration is no longer supported.

## Delivery phases

### Phase 1 — configured applications

1. Refactor configuration and types from projects/resources to applications.
2. Make `coolify_applications` the server-side allow-list and endpoint source of truth.
3. Separate project, application, and deployment response schemas.
4. Implement application lookup and deployment lookup against the documented Coolify endpoints.
5. Keep project and environment metadata optional on an application configuration record.
6. Update module routes and diagnostics to use application terminology internally while retaining
   the user-facing module name `Deployments`.

### Phase 2 — project and environment context

1. Add project and environment discovery/read methods.
2. Use provider metadata to enrich application labels and navigation.
3. Allow an application to be selected by environment without making environments deployable.
4. Decide whether configuration stores provider UUIDs only or supports a discovery/selection flow.

### Phase 3 — deployment operations

1. Implement the `Coolify Deploy` Flow operation.
2. Support deploy-by-UUID, tag, and PR inputs where the configured application permits them.
3. Add current-running-deployment state and safe polling.
4. Add audit logging and dedicated Directus permission guidance for deployment mutations.

### Later, explicitly out of scope

The bundle will not become a general Coolify administration interface. It will not manage databases,
workers, services, Coolify server settings, arbitrary Coolify configuration, or per-application API
tokens unless the scope is deliberately revisited.

## Security and compatibility invariants

- Coolify credentials never reach Studio, browser code, or endpoint responses.
- Callers submit stable Directus/application identifiers; provider UUIDs are resolved and checked on
  the server.
- Authentication and Directus permissions remain the primary authorization boundary.
- Same-origin checking is defense in depth, not authorization.
- Provider errors are logged server-side and exposed to clients only as safe generic errors.
- Schema changes use the shared schema lock and fail according to the configured startup policy.
- The single-instance token model remains explicit until multi-instance support is designed.

## Related references

- [Original issue #27](https://github.com/onderwijsin/directus-extensions/issues/27)
- [Schema validation follow-up #28](https://github.com/onderwijsin/directus-extensions/issues/28)
- [Coolify deployment API reference](https://coolify.io/docs/api-reference/api/deployments)
- [Coolify application API reference](https://coolify.io/docs/api-reference/api/applications)
- [Coolify project API reference](https://coolify.io/docs/api-reference/api/projects)
