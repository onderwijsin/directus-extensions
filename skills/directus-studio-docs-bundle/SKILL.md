---
name: directus-studio-docs-bundle
description: Install and configure the Directus Studio Docs bundle and its article-seeding contract.
---

# Directus Studio Docs bundle

`@onderwijsin/directus-studio-docs-bundle` is a non-sandboxed Directus `>=12.2.0 <13` bundle. It
provisions the fixed docs collection and exposes the startup contract for contributing extensions.

## Install

Install it in the Directus server runtime, then restart Directus:

```sh
pnpm add @onderwijsin/directus-studio-docs-bundle
```

Use it only on a trusted Directus installation that permits custom server extensions. This phase
does not provide a Directus Cloud-compatible serverless alternative.

## Configuration

The hook validates the following values. Directus supplies booleans according to its normal
environment parsing rules.

| Variable                               | Default      | Accepted values / behavior                                                                                                                |
| -------------------------------------- | ------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `DIRECTUS_DOCS_ENABLED`                | `true`       | Server-side provisioning and seeding gate. The client-side module remains registered because it cannot read server environment variables. |
| `DIRECTUS_DOCS_SEED_ENABLED`           | `true`       | Boolean gate for article seeding.                                                                                                         |
| `DIRECTUS_DOCS_SEEDING_STRATEGY`       | `versioning` | `override` or `versioning`.                                                                                                               |
| `DIRECTUS_DOCS_SCHEMA_CHANGES_ENABLED` | `true`       | Boolean gate for schema provisioning.                                                                                                     |
| `DIRECTUS_DOCS_SCHEMA_ABORT_ON_ERROR`  | `true`       | Boolean schema error behavior.                                                                                                            |
| `DIRECTUS_DOCS_MANAGE_POLICY_ENABLED`  | `true`       | Boolean manage-policy gate.                                                                                                               |
| `DIRECTUS_DOCS_VIEW_POLICY_ENABLED`    | `true`       | Boolean view-policy gate.                                                                                                                 |

The hook also accepts the shared startup, synchronization, and lock-provider configuration used by
the repository’s Directus extension utilities.

The article collection is fixed at `studio_docs`, and the module name is fixed at `Docs`. Neither
value is configurable through the environment because they are used by the client-side module.

`DIRECTUS_DOCS_ENABLED=false` disables the server-side hook, including schema and policy/data
provisioning. It does not hide or unregister the Studio module: app extensions run in the browser
and cannot read the server environment directly. If the module remains installed while this switch
is off, it remains visible but cannot load articles unless the collection and permissions are
provided by another mechanism.

## Current module surface

The stable Studio module id is `docs`, and its current route contract is:

```text
/docs/:uuid
```

The module loads unarchived articles in deterministic order, renders Markdown article bodies, and
shows article audit metadata. The hook provisions the fixed `studio_docs` collection during
`app.before`, and can seed the two unassigned policies during the awaited `middlewares.before`
lifecycle phase.

Schema provisioning requires both `DIRECTUS_DOCS_SCHEMA_CHANGES_ENABLED` and
`DIRECTUS_EXTENSIONS_SCHEMA_CHANGES_ENABLED`. Policy/data seeding also requires
`DIRECTUS_DOCS_SEED_ENABLED` and `DIRECTUS_EXTENSIONS_DATA_SEED_ENABLED`. The seeded policies grant
collection permissions only; neither grants Directus Data Studio access.

## Not included yet

The server-only utility package exposes `ensureDirectusDocumentation()` for participating
extensions. It accepts a stable UUID, navigation label, Markdown body, optional icon/archive values,
and supports `override` or `versioning` reconciliation. In versioning mode, changed content is
written to the reserved `incoming` version for maintainer review; it is never promoted
automatically.

Participating extensions can register articles from their startup documentation phase with the
shared `ensureDirectusDocumentation()` utility. Schema callbacks run during `app.before`, and
documentation callbacks run during the awaited `middlewares.before` phase, so the fixed collection
is provisioned before article seeds execute and seeding completes before middleware and route setup
continues. The utility supports stable UUIDs, Docs and contributor-specific seed gates, override
reconciliation, and reserved `incoming` versions for review.

Use stable UUIDs for contributed articles. The default `versioning` strategy writes changed content
to the reserved `incoming` version for review; `override` replaces the current item. Neither
strategy automatically promotes a version.

If the collection is missing, check `DIRECTUS_DOCS_SCHEMA_CHANGES_ENABLED`. If an article is
missing, check the Docs and contributor-specific seed gates and the user’s Docs policy assignment.
Startup coordination across replicas requires a shared Redis or filesystem lock provider.

The bundle does not provide article CRUD, role assignment, role membership, or automatic version
promotion. It requires a trusted Directus `>=12.2.0 <13` server runtime and is not intended for
Directus Cloud environments that do not permit custom server extensions.
