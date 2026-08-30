# @onderwijsin/directus-studio-docs-bundle

An initial scaffold for an in-Studio documentation module and shared article-seeding foundation. The
bundle targets Directus `>=12.2.0 <13` and currently registers the hook and module surfaces for the
phased implementation. Article provisioning, policies, seeding, and Markdown rendering are planned
for later phases.

## Installation

Install the package in the Directus runtime and restart Directus:

```sh
pnpm add @onderwijsin/directus-studio-docs-bundle
```

The package is non-sandboxed and requires a trusted Directus installation. It is not intended for
Directus Cloud environments that do not permit custom server extensions.

## Configuration

The hook validates these environment variables. Defaults are enabled for the planned bundle:

| Variable                               | Default      | Purpose                                                     |
| -------------------------------------- | ------------ | ----------------------------------------------------------- |
| `DIRECTUS_DOCS_ENABLED`                | `true`       | Enables the bundle lifecycle.                               |
| `DIRECTUS_DOCS_SEED_ENABLED`           | `true`       | Planned article seeding gate.                               |
| `DIRECTUS_DOCS_SEEDING_STRATEGY`       | `versioning` | Planned `override` or `versioning` reconciliation strategy. |
| `DIRECTUS_DOCS_SCHEMA_CHANGES_ENABLED` | `true`       | Planned schema provisioning gate.                           |
| `DIRECTUS_DOCS_SCHEMA_ABORT_ON_ERROR`  | `true`       | Planned schema error policy.                                |
| `DIRECTUS_DOCS_MANAGE_POLICY_ENABLED`  | `true`       | Planned manage-policy gate.                                 |
| `DIRECTUS_DOCS_VIEW_POLICY_ENABLED`    | `true`       | Planned view-policy gate.                                   |

The shared Directus extension startup and lock settings are also accepted by the hook. They are
documented in the repository’s extension utilities guidance.

The planned article collection is the fixed `studio_docs` collection and the Studio module is named
`Docs`. These client-side values are constants, not environment options.

## Collection and policies

The hook provisions the fixed `studio_docs` collection with UUID articles, Markdown bodies,
navigation labels, ordering, archive state, audit fields, and an optional icon. Collection
versioning is enabled with `archived` as the archive field. The hook can also seed the unassigned
`Can Manage Studio Docs` and `Can View Studio Docs` policies. The view policy only permits
unarchived articles; administrators must assign policies to roles.

Schema provisioning requires both `DIRECTUS_DOCS_SCHEMA_CHANGES_ENABLED` and
`DIRECTUS_EXTENSIONS_SCHEMA_CHANGES_ENABLED`. Policy/data provisioning additionally requires
`DIRECTUS_DOCS_SEED_ENABLED` and `DIRECTUS_EXTENSIONS_DATA_SEED_ENABLED`.

## Phase-two surface

The bundle registers the `Docs` Studio module with an empty route and the article route contract
`/docs/:uuid`. The module currently displays an initialization placeholder. Schema provisioning runs
during Directus `app.before`, before `server.start` data seeds. This prevents participating
extensions from seeding articles before the collection exists.

The shared utility package now exposes the server-only `seedDocsArticle()` contract for
participating extensions. It supports stable UUIDs, no-op gates, override reconciliation, and
reserved `incoming` content versions. Markdown rendering and the complete module UI remain planned
for a later phase.
