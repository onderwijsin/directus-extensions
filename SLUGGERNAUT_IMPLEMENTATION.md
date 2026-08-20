# Sluggernaut V2 — Implementation Plan

## 1. Purpose and implementation boundary

This document translates [`SLUGGERNAUT_SPEC.md`](SLUGGERNAUT_SPEC.md) into an implementation
sequence for a fresh rewrite of Sluggernaut. It is an implementation plan, not a second public
specification: the specification remains the source of truth for observable behaviour.

The legacy package is used only to identify reusable migration knowledge and compatibility hazards:
[`@onderwijsin/directus-bundle-sluggernaut`](https://github.com/onderwijsin/directus-extensions-legacy/tree/main/packages/directus-bundle-sluggernaut).
V2 must not copy its hierarchy, namespace, publication-state, random uniqueness, or system-metadata
behaviour.

The result is one new publishable bundle:

```text
Package:  @onderwijsin/directus-sluggernaut-bundle
Location: extensions/directus-sluggernaut-bundle
Host:     >=12.2.0 <13
```

The implementation is complete only when the acceptance criteria in the specification are proven by
focused unit tests, real-Directus E2E tests, package validation, and synchronized consumer docs.

## 2. Working decisions

These decisions should guide implementation unless a later repository or Directus contract proves
one to be invalid:

1. Keep all field keys arbitrary. The only discovery signal is `directus_fields.meta.interface`.
2. Put normalization, validation, deterministic ordering, and derivation in pure shared modules so
   Studio previews, hooks, operations, and tests use the same rules.
3. Use one server mutation coordinator for slug, permalink, and redirect work. Do not create
   independently reacting slug and redirect hooks.
4. Process the pipeline in strict order: `slug -> permalink -> redirect`.
5. Treat explicit payload values as the current-mutation override; interface options control future
   automatic updates and do not create per-item opt-out state.
6. Keep slug uniqueness in Directus/database constraints. Do not port v1's random suffix logic.
7. Treat permalink values as normalized absolute paths, never absolute URLs.
8. Select redirect candidates from the deterministic first interface of each type, even when that
   interface has automatic redirects disabled. A later interface never replaces it.
9. Make redirect schema and policy registration optional, idempotent, lock-safe, and
   non-destructive.
10. Preserve compatible existing redirect records as manual records unless they carry V2 provenance.
11. Prefer Directus services with the event transaction handle. The update filter passes
    `eventContext.database` as the `knex` option to both the existing-item read and redirect writes,
    so those operations share the mutation transaction when Directus supplies one. Lifecycle events
    and real-Directus atomicity still require E2E verification.
12. Use the repository's `@onderwijsin/directus-extension-utils` setup, schema, lock, logging, and
    policy-registration utilities where their contracts apply.

## 3. Proposed package anatomy

Create the package using the repository's current bundle patterns. Keep registration visible in each
entrypoint and move reusable behaviour into adjacent domain modules.

```text
extensions/directus-sluggernaut-bundle/
├── CHANGELOG.md
├── README.md
├── package.json
├── tsconfig.json
├── schema/
│   └── redirects.json                         # optional registration shape/reference
├── src/
│   ├── sluggernaut-slug/
│   │   ├── index.ts                           # interface registration
│   │   └── SlugInterface.vue
│   ├── sluggernaut-permalink/
│   │   ├── index.ts                           # interface registration
│   │   └── PermalinkInterface.vue
│   ├── sluggernaut-link/
│   │   ├── index.ts                           # display registration
│   │   └── LinkDisplay.vue
│   ├── sluggernaut-hook/
│   │   ├── index.ts                           # hook registration/lifecycle
│   │   ├── env.schema.ts
│   │   └── mutation-coordinator.ts
│   ├── sluggernaut-recalculate/
│   │   ├── index.ts                           # operation app/API registration
│   │   ├── api.ts
│   │   └── operation.vue
│   ├── shared/
│   │   ├── constants.ts
│   │   ├── types.ts
│   │   ├── interface-options.schema.ts
│   │   ├── normalization.ts
│   │   ├── configuration.ts
│   │   ├── ordering.ts
│   │   └── warnings.ts
│   ├── server/
│   │   ├── redirect-service.ts
│   │   ├── redirect-schema.ts
│   │   ├── redirect-policies.ts
│   │   ├── archive-lifecycle.ts
│   │   ├── item-reads.ts
│   │   ├── transactions.ts
│   │   └── configuration-cache.ts
│   └── shims.d.ts
├── __tests__/
│   ├── normalization.test.ts
│   ├── configuration.test.ts
│   ├── slug-derivation.test.ts
│   ├── permalink-derivation.test.ts
│   ├── redirects.test.ts
│   ├── display.test.ts
│   ├── recalculate.test.ts
│   ├── schema.test.ts
│   ├── policies.test.ts
│   └── *.e2e.test.ts
└── skills/directus-sluggernaut-bundle/SKILL.md
```

The exact filenames may change as the implementation is decomposed, but the boundaries should not:
app code must not import server-only modules, and Directus registration must remain at entrypoints.

## 4. Bundle metadata and entrypoints

Add `directus:extension` metadata for a bundle with these entries:

| Type      | Name                      | Responsibility                                               |
| --------- | ------------------------- | ------------------------------------------------------------ |
| interface | `sluggernaut-slug`        | Locked-by-default, editable slug field UI and options        |
| interface | `sluggernaut-permalink`   | Locked-by-default, editable permalink field UI and options   |
| display   | `sluggernaut-link`        | Stored-value display with copy and optional open action      |
| hook      | `sluggernaut-hook`        | Ordered derivation, canonical comparison, redirect lifecycle |
| operation | `sluggernaut-recalculate` | Scoped, paginated recalculation of derived fields            |

The package metadata must also declare the supported host range, package files, license, build,
development, and typecheck scripts consistent with neighbouring publishable bundles. The package
must depend only on published/runtime-safe dependencies; test utilities remain development-only.

Before coding against a Directus event or operation context, verify the supported Directus 12.2
contracts using the official Directus documentation/MCP, especially hook event payloads, operation
registration, item services, schema access, permissions services, and transaction availability.

## 5. Shared domain core

Implement and test these pure capabilities before wiring Directus:

### 5.1 Environment configuration

Create a Zod environment schema for:

```text
SLUGGERNAUT_ENABLED=true
SLUGGERNAUT_REDIRECTS_ENABLED=false
SLUGGERNAUT_REDIRECTS_COLLECTION=redirects
SLUGGERNAUT_SCHEMA_CHANGES_ENABLED=false
SLUGGERNAUT_MANAGE_REDIRECTS_POLICY_ENABLED=false
SLUGGERNAUT_READ_ACTIVE_REDIRECTS_POLICY_ENABLED=false
```

Use the repository-wide schema-change gate as an upper bound. Validate the configured collection
identifier once at the extension boundary, then pass the parsed configuration to all redirect,
schema, policy, and logging code. No subsystem may hardcode `redirects`.

Disabled startup must return before optional validation, service initialization, schema changes, or
policy registration, following the repository extension setup pattern.

### 5.2 Interface configuration discovery

Build a schema reader that:

1. Reads field metadata for the target collection.
2. Selects fields by interface ID, never by field key.
3. Parses slug/permalink options with Zod.
4. Sorts each interface set by `meta.sort`, null values last, then field key.
5. Identifies all derivation participants and exactly one deterministic first candidate per type.
6. Emits prominent duplicate warnings while continuing to support independent derivation.
7. Validates permalink `slugField` references against same-collection slug interfaces.

Invalid configuration must produce an actionable warning/error and must not be converted into unsafe
defaults. Cache parsed configuration per collection only after correctness is established.
Invalidate it when relevant Directus field metadata changes; if reliable invalidation is
unavailable, use a safe short-lived/disposable cache or explicitly document the refresh boundary.

### 5.3 Slug normalization and derivation

Provide pure functions for:

- resolving final source values from payload plus the minimal existing-item read;
- distinguishing property presence from truthiness;
- omitting `null`, `undefined`, empty, and whitespace-only values;
- combining source fields in configured order;
- locale-aware slugification and optional lowercasing;
- normalizing explicit values through the same path;
- returning `null` when all sources are empty.

The derivation function must support independent multiple slug interfaces and must not perform
application-side uniqueness checks or suffix generation.

### 5.4 Permalink normalization and derivation

Provide pure functions for:

- validating absolute paths with a leading slash;
- rejecting schemes, hosts, protocol-relative URLs, queries, fragments, backslashes, controls, and
  `.`/`..` segments;
- optionally collapsing repeated internal slashes;
- normalizing prefixes (`news`, `/news`, `/news/` -> `/news`);
- enforcing prefix membership on manual input without silently adding a prefix;
- applying generated and optionally manual trailing-slash policy while preserving `/`;
- joining a selected slug with a prefix;
- normalizing HTTP(S) display hosts and rejecting paths, credentials, base paths, and non-HTTP(S)
  values.

Keep app and server-facing types separate where needed, but make their rules identical and keep the
server authoritative.

### 5.5 Canonical URL selection

Implement one function that selects the redirect canonical value:

1. First permalink interface, if configured as an automatic redirect source.
2. Otherwise first slug interface, if configured as an automatic redirect source, represented as
   `/${slug}`.
3. Otherwise no automatic canonical source.

This function must produce at most one old/new canonical pair for a mutation, even when slug and
permalink both change.

## 6. Studio implementation

### 6.1 `sluggernaut-slug`

Implement a string-field interface with options for `sourceFields`, `locale`, `lowercase`,
`updateOnSourceChange`, and `automaticRedirects`. `sourceFields` is required. The fresh mount is
locked; unlocking only changes the Studio editor state and never changes server automation.

The UI should show the current value, copy action, lock state, unlock action, and editable input
while unlocked. It must not mark the Directus field readonly, so API, Flow, import, SDK, and
server-side writes remain possible.

### 6.2 `sluggernaut-permalink`

Implement options for `generateFromSlug`, `slugField`, `updateOnSlugChange`, `prefix`,
`validatePrefixOnManualInput`, `trailingSlash`, `enforceTrailingSlashOnManualInput`, and
`automaticRedirects`, using the specification defaults.

When generated from a slug, offer only same-collection `sluggernaut-slug` fields as choices. Allow
automatic preselection only when exactly one exists. When standalone, hide/disable slug-derived
options and retain path validation and locked-editable behaviour.

Preview and manual validation should call shared normalization functions; the server still validates
all writes.

### 6.3 `sluggernaut-link`

Display the complete stored value, handle `null`, and always provide copy. With a valid normalized
host, provide an open action targeting `host + value` (slug values get a leading slash) with
`target="_blank"` and `rel="noopener noreferrer"`. Copy must copy the stored value, not the absolute
URL.

## 7. Server mutation coordinator

Implement `sluggernaut-hook` as one coordinated pipeline:

```text
hook event
  -> identify relevant collection and mutation kind
  -> discover/validate field configuration
  -> read only required existing values
  -> derive all affected slugs
  -> derive all affected permalinks from final slug state
  -> determine the single redirect candidate
  -> compare old/new canonical values
  -> apply redirect plan and lifecycle changes
  -> let the content mutation complete using supported transaction semantics
```

For create/update:

- explicit slug/permalink payload values win for that mutation;
- source and slug changes use the final state of all required fields;
- stable permalinks remain unchanged unless synchronization is enabled;
- explicit permalink input wins even when synchronization would otherwise run;
- unrelated bulk changes pass through without unnecessary reads;
- ambiguous bulk operations must be rejected rather than applying one derived value to many items.

For deletes and Directus-native archive transitions, use provenance metadata to deactivate only
Sluggernaut-managed redirects. Preserve records and mark `inactive_reason` as `delete` or `archive`.
On explicit unarchive, reactivate only redirects previously deactivated for archive. A manual
redirect state update should clear automatic suspension metadata where Directus event semantics
allow that distinction.

## 8. Redirect service and optional infrastructure

### 8.1 Redirect data contract

The configured collection must support:

```text
id, origin, destination, type, is_active, start_date, end_date,
managed_by, source_collection, source_item, source_field, source_type, inactive_reason
```

Use the existing public redirect fields where compatible. Managed records carry:

```text
managed_by: "sluggernaut"
source_type: "slug" | "permalink"
inactive_reason: "archive" | "delete" | null
```

Manual records have no Sluggernaut provenance and must never be claimed by inference.

### 8.2 Redirect algorithms

Implement the redirect plan as a small, testable service:

1. Do nothing on initial creation or when the canonical value is unchanged.
2. Do not create self-redirects.
3. If the origin conflicts with an unowned redirect, preserve it, warn, and do not fail the content
   mutation.
4. Create managed redirects as active `301` records.
5. Flatten chains by rewriting owned redirects whose destination equals the old canonical URL.
6. When a canonical URL is reverted, deactivate/remove the obsolete owned self-origin redirect so no
   loop remains.
7. Never delete redirect history merely because a source item was deleted.

Gate this service on both global `SLUGGERNAUT_REDIRECTS_ENABLED` and the selected interface's
`automaticRedirects`. If redirect infrastructure is disabled or incompatible, slug/permalink
derivation must continue to work and the failure must be structured and visible.

### 8.3 Schema registration

Use `@onderwijsin/directus-extension-utils` schema registration and locking. When both Sluggernaut's
flag and the repository-wide gate permit changes:

- create/reconcile the configured collection idempotently;
- add missing required fields only when safe;
- reuse compatible existing fields;
- warn on incompatible structures;
- never destructively recreate a collection.

When the collection is unavailable or incompatible, skip redirect runtime and policy registration,
but keep field derivation operational.

### 8.4 Policy registration

Use the repository shared policy registration mechanism. Register, without assignment:

- `Can Manage Redirects`: CRUD access limited to the configured redirect collection;
- `Can Read Active Redirects`: read-only access with active-window filtering on `is_active`,
  `start_date`, and `end_date`.

Make identities stable and registration idempotent. Never grant administration, unrelated collection
access, role/policy management, or automatic role assignment.

## 9. Recalculate operation

Register operation `sluggernaut-recalculate`, displayed as `Sluggernaut: Recalculate Fields`.

Inputs:

```ts
{
  collection: string;
  fieldKeys?: string[];
  createRedirects: boolean; // default true
}
```

Implementation sequence:

1. Validate the collection and optional field allowlist.
2. Discover all configured interfaces.
3. Select only derived fields: slug fields with `sourceFields`, permalink fields with
   `generateFromSlug=true`; skip standalone permalinks.
4. Apply the allowlist strictly; do not implicitly recalculate dependents.
5. Paginate records and process each item independently.
6. Resolve selected slugs before selected permalinks.
7. Use the same redirect planner, gated by `createRedirects`.
8. Return bounded statistics (`processed`, `updated`, `skipped`, `failed`) and log detailed item
   failures structurally.

The operation must not load a collection into memory as one unbounded array and must preserve the
distinction between permalink-only recalculation (stored slug input) and slug-only recalculation (no
implicit permalink update).

## 10. Test and verification plan

### 10.1 Unit-test layers

Write tests in this order so most behaviour is proven without Directus mocks:

1. Environment and interface-option schemas.
2. Slug source resolution, falsy handling, normalization, explicit overrides, and multiple fields.
3. Path, prefix, host, and trailing-slash normalization.
4. Configuration discovery, deterministic ordering, duplicate warnings, and source validation.
5. Permalink derivation and synchronization decisions.
6. Canonical source selection and redirect planning, including conflicts, chains, reversion, loops,
   provenance, and lifecycle transitions.
7. Display rendering/action contracts and operation field-scope/dependency logic.
8. Directus adapter tests for services, schema reconciliation, policies, logging, and transaction
   wiring.

Cover every case listed in specification section 80. Treat arbitrary field keys, payload property
presence, stable permalinks, first-interface redirect selection, and manual redirect preservation as
regression-critical tests.

### 10.2 Real Directus E2E

Add a package E2E fixture using the repository's shared Compose/E2E workflow. Configure collections
with deliberately non-conventional keys such as `public_slug`, `canonical_route`, and multiple
independent interfaces. Verify all 33 E2E requirements in specification section 81, including:

- server-side rejection of invalid paths;
- schema and policy idempotence;
- custom redirect collection names;
- deletion/archive/unarchive provenance behaviour;
- exact recalculate scope;
- API writes despite Studio locks;
- transaction behaviour;
- safe/explicit bulk mutation behaviour.

Allow the full Compose startup window, and ensure disposable Compose projects/volumes are cleaned up
on success, failure, and interruption according to repository policy.

### 10.3 Package and repository gates

For the implementation change, run the applicable repository gates in documented order:

```sh
corepack pnpm format
corepack pnpm build:utils
corepack pnpm lint:fix
corepack pnpm typecheck
corepack pnpm test:unit
corepack pnpm build
corepack pnpm validate:packages
```

Because this bundle changes Directus loading and packed runtime behaviour, also run the clean packed
consumer E2E path from `docs/workspace.md`. Review `git diff --check`, package contents, generated
output, and `git status --short`. Do not commit as part of implementation.

## 11. Documentation and release work

Create/update together with the package:

- `README.md`: installation, Directus compatibility, environment variables and defaults, all five
  entries, interface setup, locks, prefixes, trailing slashes, redirects, schema/policies,
  recalculation, migration, limitations, and v1/v2 coexistence warning;
- `skills/directus-sluggernaut-bundle/SKILL.md`: complete operator/agent guidance with configuration
  tables, setup examples, permissions, lifecycle, troubleshooting, deployment boundaries, and
  non-goals;
- `CHANGELOG.md`: initial package release entry in the repository's established format;
- one package-scoped Changeset for the new public bundle once implementation is ready.

The root implementation plan and V2 specification are maintainer documents and do not need to be
duplicated into the consumer README or skill. The README and skill must use the new package name and
must not describe legacy namespace settings as supported V2 configuration.

## 12. Implementation phases and exit criteria

### Phase 0 — Contract verification

- Verify Directus 12.2 bundle, interface, display, hook, operation, service, schema, policy, and
  transaction contracts with official documentation/MCP.
- Inspect current repository bundle, operation, schema, policy, E2E, and documentation patterns.
- Confirm package registry/publish configuration for the new namespace.
- Record any Directus limitation that changes atomicity, bulk handling, or policy filters.

Exit: no undocumented Directus assumption remains in the design.

### Phase 1 — Scaffold and pure core

- Create package metadata, build/typecheck scripts, bundle entries, and empty registration shells.
- Implement environment/options schemas, types, ordering, slug/path/host normalization, and pure
  derivation.
- Add focused unit tests before server integration.

Exit: pure unit suite passes and app/server boundaries typecheck.

### Phase 2 — Studio entries

- Implement slug and permalink interfaces with locked-editable UX.
- Implement link display copy/open behaviour and host validation.
- Add app tests for nulls, lock transitions, validation, and actions.

Exit: all app behaviours are covered without server-side assumptions.

### Phase 3 — Mutation and redirects

- Implement schema discovery/cache and the ordered coordinator.
- Implement minimal reads and slug/permalink mutation insertion.
- Implement canonical selection, managed redirect planning, chain flattening, conflict handling,
  deletion, archive, unarchive, and manual override semantics.
- Wire structured logging and safe disabled/incompatible paths.

Exit: adapter/unit suite proves the full mutation state machine.

### Phase 4 — Schema and policies

- Integrate shared schema registration and locks.
- Reconcile compatible existing collections and warn on incompatibility.
- Integrate shared policy registration with stable identities and no assignment.

Exit: registration is idempotent, non-destructive, gated, and tested against a real schema.

### Phase 5 — Recalculate operation

- Implement validated inputs, strict field scope, dependency ordering, pagination, bounded results,
  redirect opt-out, and structured failures.
- Add operation app/API tests and large-collection safety coverage.

Exit: all recalculation unit requirements pass and operation is loadable in Directus.

### Phase 6 — E2E, docs, and release readiness

- Add the real-Directus fixture and execute the E2E matrix.
- Write README, consumer skill, changelog, and Changeset.
- Build, pack, validate, install the packed bundle into a clean consumer, and run the final gates.
- Review the complete diff for legacy concepts, public-contract drift, generated files, and
  unrelated changes.

Exit: specification acceptance criteria are mapped to passing evidence or explicitly documented
limitations, and the package is ready for maintainer review.

## 13. Risks and explicit follow-up decisions

Resolve these during Phase 0 rather than silently guessing:

1. Which Directus hook events expose enough old/new item and transaction context for atomic derived
   writes and redirect updates?
2. What is the supported, permission-safe accountability for internal item/schema/policy services?
3. How should Directus bulk mutations be represented in the chosen event contract, and what exact
   ambiguity requires rejection?
4. What schema-registration and policy-registration helpers are available in the current
   `extension-utils` version, including their lock and idempotence guarantees?
5. Which slugification library/version is compatible with the repository's dependency policy and
   required locale semantics?
6. What exact Directus archive metadata shape and transition payload are available in version 12.2?
7. Which package registry and publish configuration should be used for the new namespace, and what
   package name/host metadata does Marketplace validation require?
8. Can field configuration cache invalidation be observed reliably, or must the cache be bounded and
   refreshed conservatively?

If any answer changes public behaviour or compatibility, update the specification/decision record
before implementation rather than encoding an undocumented workaround.

## 14. Definition of done

- The new bundle exposes exactly the five specified entry names.
- All derivation is field-interface-driven and supports arbitrary field keys.
- Slug and permalink derivation are independent, deterministic, and server-validated.
- Permalinks are stable by default and valid absolute paths.
- Redirects are opt-in, single-source, provenance-aware, chain-flattening, lifecycle-safe, and
  non-destructive toward manual records.
- Schema and policy registration are optional, gated, idempotent, lock-safe, and never auto-assign.
- Recalculate Fields is paginated, strictly scoped, dependency-aware, and optionally redirecting.
- Studio locking is UX-only and does not make fields readonly to APIs or server operations.
- Unit and real-Directus E2E tests cover the complete specification matrix.
- README, consumer skill, changelog, package metadata, and Changeset are synchronized.
- Formatting, linting, typechecking, unit tests, build, packed-package validation, and applicable
  E2E checks pass with exact commands recorded in the handoff.
