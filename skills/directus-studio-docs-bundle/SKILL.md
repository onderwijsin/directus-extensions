---
name: directus-studio-docs-bundle
description: Install and configure the Phase 1 Directus Studio Docs bundle scaffold.
---

# Directus Studio Docs bundle

`@onderwijsin/directus-studio-docs-bundle` is a non-sandboxed Directus `>=12.2.0 <13` bundle. It
currently provides the Phase 1 registration scaffold for a future in-Studio documentation system.

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

| Variable                               | Default      | Accepted values / behavior                                |
| -------------------------------------- | ------------ | --------------------------------------------------------- |
| `DIRECTUS_DOCS_ENABLED`                | `true`       | Boolean master switch.                                    |
| `DIRECTUS_DOCS_SEED_ENABLED`           | `true`       | Boolean gate reserved for article seeding.                |
| `DIRECTUS_DOCS_SEEDING_STRATEGY`       | `versioning` | `override` or `versioning`.                               |
| `DIRECTUS_DOCS_SCHEMA_CHANGES_ENABLED` | `true`       | Boolean gate reserved for schema provisioning.            |
| `DIRECTUS_DOCS_SCHEMA_ABORT_ON_ERROR`  | `true`       | Boolean schema error behavior reserved for a later phase. |
| `DIRECTUS_DOCS_MANAGE_POLICY_ENABLED`  | `true`       | Boolean manage-policy gate reserved for a later phase.    |
| `DIRECTUS_DOCS_VIEW_POLICY_ENABLED`    | `true`       | Boolean view-policy gate reserved for a later phase.      |

The hook also accepts the shared startup, synchronization, and lock-provider configuration used by
the repository’s Directus extension utilities.

The planned article collection is fixed at `studio_docs`, and the module name is fixed at `Docs`.
Neither value is configurable through the environment because they are used by the client-side
module.

## Current module surface

The stable Studio module id is `docs`, and its current route contract is:

```text
/docs/:uuid
```

The empty module route and article route currently render an initialization placeholder. The hook
provisions the fixed `studio_docs` collection during `app.before`, and can seed the two unassigned
policies during `server.start`.

Schema provisioning requires both `DIRECTUS_DOCS_SCHEMA_CHANGES_ENABLED` and
`DIRECTUS_EXTENSIONS_SCHEMA_CHANGES_ENABLED`. Policy/data seeding also requires
`DIRECTUS_DOCS_SEED_ENABLED` and `DIRECTUS_EXTENSIONS_DATA_SEED_ENABLED`.

## Not included yet

The server-only utility package exposes `seedDocsArticle()` for participating extensions. It accepts
a stable UUID, navigation label, Markdown body, optional sort/icon/archive values, and supports
`override` or `versioning` reconciliation. In versioning mode, changed content is written to the
reserved `incoming` version for maintainer review; it is never promoted automatically.

The module UI, article CRUD experience, and Markdown rendering remain planned for a later phase.
