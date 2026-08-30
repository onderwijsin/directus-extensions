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

## Phase-one surface

The bundle registers the `Docs` Studio module with an empty route and the article route contract
`/docs/:uuid`. The module currently displays an initialization placeholder. The hook validates the
configuration boundary but does not yet change the schema, policies, or data.

This release does not yet provide article authoring, collection provisioning, access policies,
cross-extension seeding, version reconciliation, or Markdown rendering.
