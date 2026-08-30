# `directus-studio-docs-bundle` specification and implementation plan

Status: proposed

## Introduction

`directus-studio-docs-bundle` is a small internal documentation platform for Directus Studio. It
provides a central collection for articles written primarily by developers, a Studio module for
reading those articles, and a shared seeding contract so other extensions can ship their own
operator and editor documentation.

The extension is intentionally a documentation shell, not a content authoring system. Authors own
the Markdown body, including headings, links, examples, and further-reading sections. The bundle
owns collection provisioning, publication visibility, navigation, audit metadata, and rendering the
body with Comark.

The primary goals are:

- make project-specific Studio guidance available without leaving Directus;
- keep documentation discoverable through a predictable, ordered module navigation;
- allow installed extensions to contribute default articles without taking ownership of the whole
  documentation collection; and
- make extension-provided updates safe to review when maintainers have edited the installed copy.

This proposal targets Directus `12.2.0` and newer. Exact component composition and compatibility
shims remain implementation decisions to be verified against that supported baseline.

## Specification

### 1. Extension shape and configuration

The published bundle contains:

- a hook extension for schema, policy, and article startup provisioning; and
- a Studio module extension for reading the published articles.

The collection name is the fixed client-side constant `studio_docs`.

The bundle is enabled by default when installed, subject to the repository’s normal extension setup
lifecycle. Configuration should be validated at the hook entrypoint with Zod and documented in both
the package README and its consumer skill.

Proposed options:

| Variable                               | Default      | Meaning                                                                             |
| -------------------------------------- | ------------ | ----------------------------------------------------------------------------------- |
| `DIRECTUS_DOCS_ENABLED`                | `true`       | Enables the documentation bundle, including its Studio module and startup behavior. |
| `DIRECTUS_DOCS_SEED_ENABLED`           | `true`       | Enables article seeding from this bundle and participating extensions.              |
| `DIRECTUS_DOCS_SEEDING_STRATEGY`       | `versioning` | Accepts `override` or `versioning`; controls handling of changed seeded articles.   |
| `DIRECTUS_DOCS_SCHEMA_CHANGES_ENABLED` | `true`       | Controls collection schema provisioning.                                            |
| `DIRECTUS_DOCS_SCHEMA_ABORT_ON_ERROR`  | `true`       | Controls whether an unexpected schema/policy provisioning error aborts startup.     |
| `DIRECTUS_DOCS_MANAGE_POLICY_ENABLED`  | `true`       | Controls seeding of the manage policy.                                              |
| `DIRECTUS_DOCS_VIEW_POLICY_ENABLED`    | `true`       | Controls seeding of the view policy.                                                |

The existing global startup gates and lock-provider settings remain applicable. Docs seeding has two
gates: `DIRECTUS_DOCS_SEED_ENABLED` must be true and `DIRECTUS_EXTENSIONS_DATA_SEED_ENABLED` must be
true. A false global data-seed gate always disables docs seeding, regardless of the docs-specific
setting.

### 2. Collection provisioning

The hook provisions the fixed `studio_docs` collection with the following logical fields:

| Field              | Required behavior                                                                                                                       |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| `uuid`             | Primary key, UUID value, generated for manually-created articles. Seeded articles use a stable UUID supplied by the article definition. |
| `navigation_label` | Required short label shown in module navigation and the private-view title.                                                             |
| `body`             | Required Markdown text rendered by Comark.                                                                                              |
| `sort`             | Required numeric ordering value. Lower values appear first. Ties require a deterministic secondary order, preferably `uuid`.            |
| `archived`         | Boolean archive flag. `false` means visible/published; `true` means archived and excluded from the module. Default: `false`.            |
| `user_created`     | Nullable Directus user audit field recording the creating user.                                                                         |
| `date_created`     | Nullable Directus audit field recording creation time.                                                                                  |
| `date_updated`     | Directus audit field recording last update time.                                                                                        |
| `icon`             | Optional Directus icon name. Uses the Directus icon-picker interface. A stable fallback icon is shown when empty.                       |

The collection has Directus content versioning enabled with this collection metadata:

```json
{
  "meta": {
    "versioning": true,
    "archive_field": "archived",
    "archive_app_filter": true,
    "archive_value": true,
    "unarchive_value": false
  }
}
```

The archive field is `archived`, matching Directus’s configured archive metadata. The module and
policies filter on this field. The schema metadata above is authoritative for Directus archive
behavior.

The schema definition should use the repository’s existing lock-aware schema ensure path and
preserve compatible existing collection and field definitions. It must not overwrite unrelated
presentation metadata on an existing collection.

`user_created` and `date_created` are nullable so system-side and imported seeds can be created
without an authenticated author. If `uuid` conflicts with Directus’s collection identity handling,
the implementation must retain the public field contract while using the repository’s established
identity adapter.

### 3. Policies

The hook seeds these policies, subject to their individual configuration gates:

- `Can Manage Studio Docs`: full CRUD access to the fixed docs collection, including access required
  to review and promote content versions in the normal collection editor;
- `Can View Studio Docs`: read access to the fixed docs collection with a filter for the
  non-archived state. It does not grant access to version-management behavior.

Policies are not assigned automatically to roles or users. Administrators decide which roles receive
them. The module must continue to rely on Directus accountability and permissions; it must not use
elevated server-side reads to expose articles to a Studio user who lacks the view policy.

The policy definitions should use the fixed `studio_docs` collection name and be seeded through the
shared `ensureDirectusPolicy` path. The view policy filters the archive field to its unarchived
value. It does not filter versions: the module always reads the main version. Content versioning is
available through the normal collection editor only, and therefore only to users with the manage
policy.

### 4. Studio module

The module is registered with a stable public module id and the fixed public name `Docs`. Its route
contract is:

```text
/docs/:uuid
```

There is no archive page, overview page, or separate landing route. The empty module route resolves
to the article with the lowest `sort` value among visible articles and redirects or renders that
article using the same article view. If there are no visible articles, the module shows a clear
empty state rather than attempting to navigate to an invalid UUID.

The module navigation:

- loads visible articles from the fixed `studio_docs` collection;
- excludes archived articles using the configured archive field/value;
- excludes non-published/draft content by reading the main version only;
- orders articles by ascending `sort`, with a deterministic tie-breaker;
- displays each article’s `icon`, or the documented fallback icon; and
- displays each article’s `navigation_label`.

Selecting a navigation entry opens `/docs/:uuid`. A missing, forbidden, archived, or otherwise
unavailable article must produce an understandable not-found/forbidden state and must not render
stale content from a previous route.

The article view uses Directus’s `private-view` shell:

- the `title` slot/value is populated with the article’s `navigation_label`;
- the sidebar area renders `date_created` and `date_updated`, with clear labels and a consistent
  date format; and
- the main content area renders `body` through Comark’s Vue renderer.

The renderer uses Comark’s `Markdown` component. Because Comark documents this as an async Vue
component, the implementation must render it within `Suspense`. No custom Markdown component
vocabulary is promised by this extension unless explicitly added later.

The module must handle loading, empty, permission, not-found, and rendering-error states. It should
refresh article data when navigation changes and avoid retaining a prior article’s title, audit
fields, or body while a new article is loading.

### 5. Shared article-seeding contract

`@onderwijsin/directus-extension-utils/server` should expose a server-only helper for participating
extensions. The public shape is conceptually:

```ts
ensureDirectusDocumentation(article, context, options?)
```

The final signature should fit the existing startup helper conventions while keeping the article
definition independent of Directus service constructors. An article definition contains at least:

```ts
{
  uuid: string
  navigation_label: string
  body: string
  sort?: number
  icon?: string
  archived?: boolean
}
```

Seeded articles must provide a stable UUID. The helper normalizes defaults, validates the boundary
input, resolves the fixed `studio_docs` collection, and writes only the article fields owned by the
seed. It must not modify `date_created` or `date_updated` directly.

The helper is a no-op when `DIRECTUS_DOCS_ENABLED=false`, `DIRECTUS_DOCS_SEED_ENABLED=false`, or the
global `DIRECTUS_EXTENSIONS_DATA_SEED_ENABLED=false` gate is active. Participating extensions may
provide an extension-specific gate, for example `SLUGGERNAUT_DIRECTUS_DOCS_SEED_ENABLED=false`; an
extension-specific false always wins. The helper must also no-op, with an actionable debug/info log,
when the docs collection is unavailable because the bundle is not installed or its schema
provisioning is disabled.

The helper is intended to run from the existing generic startup data phase:

```ts
startup.data(async ({ lockProvider }) => {
  await ensureDirectusDocumentation(article, context, { lockProvider })
})
```

`ensureDirectusDocumentation()` remains public because participating extensions need a small,
extension-independent way to contribute articles. The existing per-extension `startup.data()` phase
is not by itself sufficient: a consumer’s data callback must not run until the docs bundle’s
`ensureDirectusSchema` callback has completed. The implementation must therefore establish a
cross-extension startup barrier with separate schema and data phases, or another mechanism with the
same guarantee. It must not depend on the docs bundle loading first unless Directus extension
loading is verified to be synchronous and registration order is a supported, deterministic contract.
Bounded retries are not the primary correctness mechanism. If the docs bundle is absent, the
consumer must remain safe and continue startup.

### 6. Seed reconciliation and versioning

The helper compares the incoming seed with the current main version using a canonical content
fingerprint. The fingerprint includes the seed-owned fields:

```text
  uuid, navigation_label, body, sort, archived, icon
```

It excludes audit fields and Directus-managed metadata. The canonical representation must have
stable key order and normalized optional values before hashing. A cryptographic hash such as SHA-256
is preferred over timestamps or a manually maintained version counter. The hash is an implementation
detail and must not be stored as a public collection field unless later evidence shows that
persistence is required.

Reconciliation behavior:

1. If no article exists, create it as a published main item (`archived=false` unless the seed
   explicitly requests otherwise).
2. If the incoming fingerprint equals the current main fingerprint, do nothing.
3. If fingerprints differ and strategy is `override`, update the main item with the incoming seed.
4. If fingerprints differ and strategy is `versioning`, preserve the current main item and create or
   update the reserved incoming version for that article through Directus’s `VersionsService` from
   `context.services`.
5. The incoming version uses the reserved key `incoming` and a human-readable display name such as
   `Incoming`. If it already exists, reconcile the incoming seed into that version rather than
   creating another incoming version.
6. Promotion of `incoming` is a maintainer action in Directus and is never performed by the seeder.

The `VersionsService` constructor and method semantics are implementation details. The
implementation should use the service exposed through `context.services` and consult the
[`VersionsService` source](https://github.com/directus/directus/blob/main/api/src/services/versions.ts)
while implementing against Directus `12.2.0`. This includes verifying how to create/update a
version, how versioned item fields are read, and how audit fields behave across versions. If
`incoming` conflicts with an existing version key or other consumer configuration, startup fails
with a clear configuration error. The seeder must not silently choose another key because that would
create multiple unmanaged proposals.

Seed failures for one article should be reported with the article UUID and extension name. The
failure policy should follow the existing startup coordinator’s `abortOnError` behavior rather than
silently claiming success.

### 7. Integration expectations

The docs bundle itself may ship a small set of articles, but its primary value is accepting articles
from other extensions. A participating extension such as Sluggernaut should:

- add its extension-specific docs seed gate to its validated environment schema;
- register one or more `startup.data()` callbacks that call `ensureDirectusDocumentation()`;
- provide stable UUIDs and developer-owned Markdown; and
- document that the articles appear only when the docs bundle is installed and enabled.

Consuming projects may also register their own articles through the same utility contract. The docs
bundle must not require those projects to modify the module or bundle source.

### 8. Security, compatibility, and non-goals

- Article visibility is controlled by Directus authentication, the view policy’s archive filter, and
  the module’s main-version query.
- Markdown rendering must use Comark’s safe/default rendering behavior. The implementation must
  verify how raw HTML, links, and any Comark components are handled before promising support for
  author-provided markup.
- The bundle does not provide public API endpoints, external publishing, search, full-text indexing,
  comments, translations, automatic table of contents, or an archive browser.
- The bundle does not assign policies to roles, manage role membership, or replace Directus’s
  version promotion workflow.
- The minimum supported Directus version is `12.2.0`. The implementation must still verify
  `@comark/vue` compatibility and the exact service contracts before scaffolding package metadata.

## Phase-based implementation plan

### Phase 1 — Scaffold extension, configuration, and tests

- Scaffold `extensions/directus-studio-docs-bundle` as a bundle containing a hook and module.
- Add package metadata, entrypoints, environment schema, stable identifiers, and the default
  collection/policy constants.
- Verify the supported Directus version, module route API, private-view slots, collection versioning
  metadata, and Content Versions API against official documentation before implementing behavior.
- Add focused test scaffolds for hook registration, environment validation, module registration, and
  route definitions.
- Add `@comark/vue` only if the verified implementation requires it, using an exact workspace
  catalog entry and documenting the dependency decision.

### Phase 2 — Startup orchestration, collection/policies, and utility contract

- Resolve and implement a cross-extension startup barrier: all schema ensures must complete before
  any docs data seed can execute. Prefer a shared schema phase followed by a shared data phase
  across startup coordinators; do not use bounded retries as the correctness mechanism.
- Verify whether Directus extension registration and startup callback execution are synchronous or
  concurrent. Treat load-order dependence as unacceptable unless it is a documented, deterministic
  contract and the bundle can be guaranteed to load first.
- Keep `ensureDirectusDocumentation()` as the public utility and use the generic startup data
  registration only after the cross-extension barrier is established; a new `startup.docs()` method
  is not required unless it is the cleanest API for implementing that barrier.
- Implement and test collection provisioning, including versioning-enabled metadata and compatible
  existing-schema behavior.
- Implement and test the manage/view policy definitions against the fixed collection.
- Add `ensureDirectusDocumentation()` and its canonical fingerprint/reconciliation logic to
  extension-utils.
- Add utility tests for gates, stable identity, no-op behavior, identical seeds, override strategy,
  incoming-version strategy, repeated incoming updates, and absent-collection readiness behavior.
- Update extension-utils public exports, runtime subpaths, maintainer cookbook documentation, and
  the utility consumer-facing API reference as required.

### Phase 3 — Cross-extension startup integration

- Add a representative `startup.data()` registration to Sluggernaut or a small test fixture
  extension that calls `ensureDirectusDocumentation()`, using a stable article ID UUID.
- Test the bundle-enabled path, bundle-disabled/no-collection path, extension-specific opt-out, and
  startup ordering/barrier behavior, including concurrent extension registration if applicable.
- Verify that the article is initially visible, that changed seeds follow the configured strategy,
  and that the module’s visibility filters exclude archived/draft content.
- Add a separate Changeset for the utility package concern if its public API changes, and one for
  the new publishable bundle.

### Phase 4 — Studio module and rendering

- Implement the module navigation query and deterministic ordering.
- Implement the empty route behavior, `/docs/:uuid` article route, loading/error states, title
  population, audit sidebar, and archived/draft exclusion.
- Integrate Comark’s `Markdown` Vue component inside `Suspense` and add the minimum required styles
  for readable Studio documentation.
- Add component/module tests for navigation, route changes, empty state, title/audit rendering,
  permission/not-found handling, and Markdown rendering.
- Run a focused local Studio verification against the shared Directus instance.

### Phase 5 — Final documentation and release validation

- Complete the bundle README and `skills/directus-studio-docs-bundle/SKILL.md` with installation,
  configuration, policies, collection contract, article authoring, seeding examples, versioning
  strategy, troubleshooting, compatibility, and non-goals.
- Synchronize extension-utils README/cookbook/skill material and the participating extension’s docs
  when public behavior changed.
- Run formatting, lint autofixes, typechecking, unit tests, builds, package validation, and packed
  consumer/E2E checks where triggered by extension loading or Directus runtime behavior.
- Review the complete diff, confirm generated output and unrelated changes are absent, record any
  unresolved Directus-version risks, and leave commits to the human maintainer.

## Open implementation decisions

These implementation details should be verified during Phase 1 or Phase 2, using official Directus
documentation and a small local verification where necessary:

1. The cross-extension startup barrier is resolved by registering schema callbacks through the
   shared startup coordinator's `init('app.before')` path and data callbacks through the following
   awaited `init('middlewares.before')` path. This is the earliest lifecycle phase after schema
   changes have been applied, while `app.after` is later and follows route registration. Extension
   load order and ordering between independent init listeners remain intentionally unsupported
   assumptions.
2. Comark’s raw-HTML and link-safety behavior under the default `Markdown` renderer.
