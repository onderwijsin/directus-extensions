# @onderwijsin/directus-studio-docs-bundle

An in-Studio documentation module and shared article-seeding foundation. The bundle targets Directus
`>=12.2.0 <13`, provisions its schema during startup, and provides the server-side collection and
policy contract used by participating extensions. Article authoring and version promotion remain
outside this bundle’s current scope.

## Installation

Install the package in the Directus runtime and restart Directus:

```sh
pnpm add @onderwijsin/directus-studio-docs-bundle
```

The package is non-sandboxed and requires a trusted Directus installation. It is not intended for
Directus Cloud environments that do not permit custom server extensions.

## Configuration

The hook validates these environment variables. Defaults are enabled:

| Variable                               | Default      | Purpose                                                                                                                                      |
| -------------------------------------- | ------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `DIRECTUS_DOCS_ENABLED`                | `true`       | Enables server-side provisioning and seeding. The client-side module remains registered because it cannot read server environment variables. |
| `DIRECTUS_DOCS_SEED_ENABLED`           | `true`       | Article seeding gate.                                                                                                                        |
| `DIRECTUS_DOCS_SEEDING_STRATEGY`       | `versioning` | `override` or `versioning` reconciliation strategy.                                                                                          |
| `DIRECTUS_DOCS_SCHEMA_CHANGES_ENABLED` | `true`       | Schema provisioning gate; requires the global schema gate too.                                                                               |
| `DIRECTUS_DOCS_SCHEMA_ABORT_ON_ERROR`  | `true`       | Schema error policy.                                                                                                                         |
| `DIRECTUS_DOCS_MANAGE_POLICY_ENABLED`  | `true`       | Manage-policy gate.                                                                                                                          |
| `DIRECTUS_DOCS_VIEW_POLICY_ENABLED`    | `true`       | View-policy gate.                                                                                                                            |

The shared Directus extension startup and lock settings are also accepted by the hook. They are
documented in the repository’s extension utilities guidance.

The article collection is fixed at `studio_docs` and the Studio module is named `Docs`. These
client-side values are constants, not environment options.

`DIRECTUS_DOCS_ENABLED=false` disables the server-side hook, including schema and policy/data
provisioning. It does not hide or unregister the Studio module: app extensions run in the browser
and cannot read the server environment directly. If the module is still installed while this switch
is off, it remains visible but cannot load articles unless the collection and permissions are
provided by another mechanism.

## Collection and policies

The hook provisions the fixed `studio_docs` collection with UUID articles, Markdown bodies,
navigation labels, ordering, archive state, audit fields, and an optional icon. Collection
versioning is enabled with `archived` as the archive field. The hook can also seed the unassigned
`Can Manage Studio Docs` and `Can View Studio Docs` policies. The view policy only permits
unarchived articles. Neither policy grants Directus Data Studio access; administrators must assign
policies to roles.

Schema provisioning requires both `DIRECTUS_DOCS_SCHEMA_CHANGES_ENABLED` and
`DIRECTUS_EXTENSIONS_SCHEMA_CHANGES_ENABLED`; the global switch is authoritative. Policy
provisioning remains ordinary extension data work and requires `DIRECTUS_DOCS_SEED_ENABLED` and
`DIRECTUS_EXTENSIONS_DATA_SEED_ENABLED`.

## Startup and collection surface

The bundle registers the `Docs` Studio module with an empty route and the article route contract
`/docs/:id`. It loads unarchived articles in deterministic order, renders Markdown article bodies,
and shows article audit metadata. Schema provisioning runs during Directus `app.before`, and data
seeding runs during the following awaited `middlewares.before` phase. This prevents participating
extensions from seeding articles before the collection exists and ensures seeding completes before
middleware and route setup continues.

The shared utility package exposes the server-only `ensureDirectusDocumentation()` contract for
participating extensions. Register it from a `startup.documentation()` callback after passing the
complete hook object to `createDirectusStartupCoordinator`; documentation callbacks run during
awaited application startup independently of the ordinary global schema/data gates. The helper
supports stable UUIDs, no-op gates, override reconciliation, and reserved `incoming` content
versions. Article CRUD and version promotion remain planned for a later phase.

## Contributing articles

An extension can contribute a stable article from its startup documentation phase:

```ts
import { ensureDirectusDocumentation } from '@onderwijsin/directus-extension-utils/server'

startup.documentation(async ({ lockProvider }) => {
  await ensureDirectusDocumentation(
    {
      id: '7b8b3a1e-38f3-4ab7-9b37-5e4c5d7f1234',
      navigation_label: 'Getting started',
      body: '# Getting started\n\nWrite the article in Markdown.',
      icon: 'menu_book',
    },
    context,
    { lockProvider, extensionName: 'My extension' },
  )
})
```

Article UUIDs are part of the contributor contract and must remain stable across releases. The
required fields are `id`, `navigation_label`, and `body`; `icon` defaults to `null`, and `archived`
to `false`.

## Versioning and visibility

The default `DIRECTUS_DOCS_SEEDING_STRATEGY=versioning` leaves the current article untouched when
content changes. It creates or updates the reserved `incoming` content version for review and never
promotes that version automatically. Use `override` only when deployment-time seeds are the source
of truth and replacing the current item is intentional.

The module requests and locally filters `archived=false` articles. The view policy applies the same
filter for users assigned that policy. Draft or incoming versions are not shown by the module; a
maintainer must review and promote versioned content through Directus.

## Troubleshooting

| Symptom                                      | Check                                                                                                                          |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `studio_docs` is missing                     | Enable both schema-change switches, then restart Directus.                                                                     |
| A contributed article is missing             | Check `DIRECTUS_DOCS_ENABLED`, `DIRECTUS_DOCS_SEED_ENABLED`, and the contributor’s `extensionSeedEnabled` option.              |
| A changed article is not visible immediately | With `versioning`, inspect the article’s `incoming` version and promote it after review; use `override` only when appropriate. |
| Users cannot see articles                    | Assign `Can View Studio Docs` to the relevant role, or assign `Can Manage Studio Docs` to editors.                             |
| Startup reports a lock skip                  | Ensure all Directus replicas use a shared Redis or filesystem lock provider when startup coordination spans processes.         |

## Compatibility and non-goals

The bundle supports Directus `>=12.2.0 <13` and requires a trusted, non-sandboxed Directus server
runtime. It is not intended for Directus Cloud environments that do not permit custom server
extensions.

The bundle does not manage article authoring, role assignment, role membership, or automatic version
promotion. It does not guarantee ordering between independent init listeners; its startup
coordinator guarantees that coordinator-managed schema work completes before data work begins, and
that data work completes during awaited startup before Directus serves requests.
