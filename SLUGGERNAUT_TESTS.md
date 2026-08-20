# Sluggernaut v2 test implementation checklist

This is a test task list for the current working-tree implementation of
`extensions/directus-sluggernaut-bundle`. It deliberately excludes cases already covered by the
existing tests under `extensions/directus-sluggernaut-bundle/__tests__/`; those files are listed
near the end as audited with no duplicate tasks.

Tags use the repository conventions:

- `[unit]` — deterministic logic, schemas, adapters, registrations, or Vue/component contracts;
- `[e2e]` — behavior that must be proven through a built bundle loaded by a real Directus instance.

Do not treat a passing unit mock as evidence for an E2E requirement. E2E fixtures should use
non-conventional field keys, own their collections/items/policies, and clean up in `finally` blocks.

## File-by-file checklist

### `package.json`

- [ ] `[unit]` Load the bundle metadata and assert the package exposes exactly the five specified
      entries, with the correct entry types, source files, app/API split for the operation, and host
      range.
- [ ] `[unit]` Build/inspect the package and assert all runtime imports are publishable runtime
      dependencies and test utilities are not bundled as runtime dependencies.
- [ ] `[e2e]` Install the packed package into a clean Directus consumer and verify every entry loads
      without unresolved imports or registration errors.

### `schema/redirects.json`

- [ ] `[unit]` Validate the schema definition contains the core redirect fields, all provenance
      fields, nullable lifecycle fields, and the intended defaults/types.
- [ ] `[unit]` Verify schema identity replacement can change the collection name without changing
      field definitions or policy semantics.
- [ ] `[e2e]` Register the schema into an empty instance and verify the resulting collection and
      fields are usable by redirect runtime operations.
- [ ] `[e2e]` Run registration twice and verify it is idempotent and non-destructive.
- [ ] `[e2e]` Run against a compatible pre-existing collection and verify it is reused; run against
      an incompatible collection and verify a visible warning plus continued slug/permalink
      derivation without redirect runtime use.

### `schema/policies.json`

- [ ] `[unit]` Assert `Can Manage Redirects` grants only CRUD on the redirect collection and does
      not grant admin, role, policy, or unrelated-collection access.
- [ ] `[unit]` Assert `Can Read Active Redirects` is read-only and its filter exactly expresses
      active status, start-date lower bound, and end-date upper bound semantics.
- [ ] `[unit]` Verify policy identity/name stability and configured-collection substitution.
- [ ] `[e2e]` Verify both policies can be registered repeatedly without duplicates, are not assigned
      automatically, and enforce the expected permissions/filter against real Directus records.

### `src/shared/configuration/constants.ts`

- [ ] `[unit]` Assert the extension identifier and both interface IDs remain stable and match the
      package metadata and specification.

### `src/shared/configuration/field-metadata.schema.ts`

- [ ] `[unit]` Cover valid metadata with absent/null/partial `meta`, null `schema`, finite/null
      `sort`, unknown Directus properties, and non-string field keys/options shapes.
- [ ] `[unit]` Verify malformed persisted metadata is rejected at the boundary rather than being
      coerced into unsafe defaults.

### `src/shared/configuration/interface-options.schema.ts`

- [ ] `[unit]` Cover every default for slug and permalink options.
- [ ] `[unit]` Reject empty/whitespace source fields, empty locale, non-boolean flags, malformed
      optional slug fields/prefixes, unknown keys, and invalid option container types.
- [ ] `[unit]` Verify trimming and default application do not alter valid arbitrary field keys.
- [ ] `[unit]` Verify standalone permalink options do not acquire an implicit slug dependency.

### `src/shared/configuration/types.ts`

- [ ] `[unit]` Add compile-time/type-contract coverage for discovered fields, warning codes, and
      collection configuration so invalid redirect-source or option shapes cannot be introduced
      silently.

### `src/shared/configuration/ordering.ts`

- [ ] `[unit]` Discover by `meta.interface`, never by conventional names such as `slug`, `path`, or
      `permalink`.
- [ ] `[unit]` Cover one and multiple independent slug fields and one and multiple independent
      permalink fields with arbitrary keys.
- [ ] `[unit]` Cover null sort values last, lexicographic field-key tie-breaking, and deterministic
      results across differently ordered metadata input.
- [ ] `[unit]` Verify duplicate slug/permalink warnings are prominent, contain actionable guidance,
      and do not disable valid independent derivation.
- [ ] `[unit]` Reject invalid slug source references, malformed interface options, generated
      permalink references to missing/non-slug/same-collection-invalid fields, while retaining
      unrelated valid configuration.
- [ ] `[unit]` Verify the first discovered interface remains the redirect candidate even when its
      `automaticRedirects` flag is false; a later enabled interface must not replace it.

### `src/shared/values/normalization.ts`

- [ ] `[unit]` Cover single-source slug derivation, arbitrary source field values, locale-specific
      slugification, lowercase on/off, Unicode/diacritics, punctuation/separators, and explicit slug
      normalization.
- [ ] `[unit]` Cover source values `null`, `undefined`, empty, whitespace, numeric zero, boolean
      false, and other falsy-but-present payload values; distinguish property presence from
      truthiness.
- [ ] `[unit]` Cover one empty source with another retained, all sources empty returning `null`, and
      no stale source material surviving an update.
- [ ] `[unit]` Cover absolute path acceptance and normalization for root, repeated slashes, spaces,
      and valid nested paths.
- [ ] `[unit]` Reject missing leading slash, schemes, hosts, protocol-relative URLs, queries,
      fragments, backslashes, control characters, dot segments, and dot-dot segments.
- [ ] `[unit]` Cover null permalink handling and the distinction between normalized values and
      rejected values.
- [ ] `[unit]` Cover prefix values `news`, `/news`, `/news/`, `/`, empty, and invalid prefixes;
      joining with empty/root/non-root prefixes and empty/null slugs.
- [ ] `[unit]` Cover exact prefix boundaries, including the prefix itself, descendants, and
      lookalikes such as `/newspaper`.
- [ ] `[unit]` Cover generated trailing-slash on/off, root preservation, duplicate trailing slashes,
      and manual enforcement on/off while preserving a valid user's choice when disabled.
- [ ] `[unit]` Cover manual prefix validation on/off without silently adding a prefix.
- [ ] `[unit]` Cover host normalization for HTTP/HTTPS origins, trailing slash removal, ports,
      query/fragment/path/base-path rejection, credentials rejection, non-HTTP schemes, and
      malformed hosts.

### `src/shared/components/CopyButton.vue`

- [ ] `[unit]` Mount with a supported clipboard API and verify the button copies the exact stored
      value, converts `null` to an empty string, stops event propagation, and changes accessible
      label to `Copied` after success.
- [ ] `[unit]` Verify small/x-small defaults and overrides, and that the control is absent when
      clipboard support is unavailable.

### `src/shared/components/SluggernautInput.vue`

- [ ] `[unit]` Verify a fresh mount is locked, input is disabled while locked, and copy remains
      available while locked.
- [ ] `[unit]` Verify unlock enables editing, emits string values for string/number/null input, and
      relock disables editing again without changing the configured value.
- [ ] `[unit]` Verify `disabled` and `nonEditable` independently suppress editing/lock controls,
      including non-editable display behavior.
- [ ] `[unit]` Verify slug/path placeholders for default English and non-English locales, error
      presentation, null values, and prop updates.
- [ ] `[unit]` Verify the shared component does not mark the Directus field readonly or prevent an
      emitted API/Flow/import/server write at the interface boundary.

### `src/sluggernaut-slug/index.ts`

- [ ] `[unit]` Assert interface registration ID, name, string type, component, and all option
      definitions/defaults, including required `sourceFields` and same-collection string source
      picker configuration.

### `src/sluggernaut-slug/interface.vue`

- [ ] `[unit]` Verify it passes value, locale, disabled, and non-editable state to the shared input
      and forwards emitted edits unchanged.
- [ ] `[e2e]` Verify a configured slug interface is locked by default in Studio while API, Flow,
      import, SDK, and server-side writes remain possible.

### `src/sluggernaut-permalink/index.ts`

- [ ] `[unit]` Assert interface registration ID, name, string type, component, all option
      definitions/defaults, and the generated-from-slug configuration surface.
- [ ] `[unit]` Verify options expose no prefix/slug-derived behavior for standalone mode at the app
      boundary where that mode is selected.

### `src/sluggernaut-permalink/interface.vue`

- [ ] `[unit]` Verify it configures the shared input as a path, forwards value/disabled/
      non-editable props, and forwards edits.
- [ ] `[e2e]` Verify manual permalink editing is locked initially, unlockable, relockable, and
      server validation remains authoritative.

### `src/sluggernaut-permalink/SlugFieldOption.vue`

- [ ] `[unit]` Mock the fields API and verify only same-collection `sluggernaut-slug` fields are
      offered, with arbitrary field keys and stable labels.
- [ ] `[unit]` Verify exactly one available slug field is auto-selected only when the current value
      is null; multiple fields require an explicit selection.
- [ ] `[unit]` Verify loading/disabled states, empty results, malformed API rows, API failures,
      collection changes, and selection clearing are handled safely and accessibly.
- [ ] `[e2e]` Verify Studio cannot configure a permalink against a missing, cross-collection, or
      non-Sluggernaut slug field.

### `src/sluggernaut-link/options.schema.ts`

- [ ] `[unit]` Cover omitted/null/valid host options and reject malformed non-string host values
      before display URL handling.

### `src/sluggernaut-link/link.ts`

- [ ] `[unit]` Cover stored slug vs stored permalink display paths, whitespace, null/undefined, and
      exact copy-value preservation.
- [ ] `[unit]` Cover host + path joining for root, slug without slash, permalink with slash, ports,
      and invalid/no host.
- [ ] `[unit]` Verify generated hrefs never include an absolute URL in the copied value and cannot
      produce an unsafe URL.

### `src/sluggernaut-link/display.vue`

- [ ] `[unit]` Mount valid/invalid/null options and verify complete stored value rendering, null
      placeholder, copy action, and open-button visibility.
- [ ] `[unit]` Mock `window.open` and verify valid hosts open with the exact href, `_blank`, and
      `noopener,noreferrer`; invalid/missing hosts and values do not open anything.
- [ ] `[unit]` Verify malformed options remain non-interactive rather than throwing during render.

### `src/sluggernaut-link/index.ts`

- [ ] `[unit]` Assert display registration ID, string type, component, and optional host option
      metadata.

### `src/server/field-reader.ts`

- [ ] `[unit]` Verify `FieldsService` receives schema, null accountability, and the event database
      handle when supplied.
- [ ] `[unit]` Verify only valid field metadata is returned, malformed rows are ignored, and
      unrelated Directus field properties survive parsing as permitted.
- [ ] `[unit]` Verify collection-scoped cache hits avoid repeated service reads, TTL expiry causes
      refresh, and `clear(collection)` invalidates only that collection.
- [ ] `[unit]` Verify cache failures propagate or are logged according to the shared cache contract
      without returning stale data as valid configuration.
- [ ] `[e2e]` Verify field metadata changes become visible after cache invalidation and do not leak
      configuration between collections.

### `src/sluggernaut-hook/configuration/env.schema.ts`

- [ ] `[unit]` Cover every documented default and valid boolean/number/collection identifier input.
- [ ] `[unit]` Reject blank, whitespace, invalid-character, leading-digit, and otherwise invalid
      redirect collection identifiers; cover trimming and finite positive cache TTL.
- [ ] `[unit]` Verify the repository-wide schema-change gate remains an upper bound over the
      Sluggernaut schema-change flag.

### `src/sluggernaut-hook/configuration/cache-invalidation.ts`

- [ ] `[unit]` Verify only field create/update/delete events are registered, each valid collection
      invalidates the matching cache, malformed metadata is ignored, and clear failures are logged.
- [ ] `[unit]` Verify invalidating one collection does not clear another collection's cache.

### `src/sluggernaut-hook/configuration/startup.ts`

- [ ] `[unit]` Verify disabled extension/global schema/data gates skip the correct startup work.
- [ ] `[unit]` Verify configured redirect collection identity is substituted in schema and policy
      definitions everywhere, with no hardcoded `redirects` runtime target.
- [ ] `[unit]` Verify schema registration passes lock provider and abort-on-error settings and
      validates the schema definition.
- [ ] `[unit]` Verify each policy flag independently registers only the requested policy, and both
      flags register both policies.
- [ ] `[unit]` Verify unavailable/incompatible redirect collections warn and skip policy
      registration without affecting derivation startup.
- [ ] `[e2e]` Verify schema startup is lock-safe, idempotent across repeated/concurrent startup, and
      never destructively recreates a compatible collection.

### `src/sluggernaut-hook/mutation/coordinator.ts`

- [ ] `[unit]` Cover explicit slug override, normalization of explicit values, and future
      `updateOnSourceChange` behavior after a manually unlocked/custom value.
- [ ] `[unit]` Cover `updateOnSourceChange=false` preserving an existing slug, while explicit slug
      payload values still win.
- [ ] `[unit]` Cover all falsy source transitions, one-source-removed/one-source-retained, all
      sources empty, and final-state reads for omitted source fields.
- [ ] `[unit]` Cover multiple independent slug fields updating separately and simultaneously.
- [ ] `[unit]` Cover generated permalink from selected slug, explicit `slugField`, explicit
      permalink override, stable-by-default permalink, synchronization, and null slug clearing.
- [ ] `[unit]` Cover prefix/trailing-slash/manual validation options through the coordinator, not
      only through isolated normalization helpers.
- [ ] `[unit]` Cover multiple independent permalink fields, standalone permalink preservation, and
      strict recalculate field allowlists including omitted, one, many, unknown, slug-only, and
      permalink-only selection.
- [ ] `[unit]` Verify the ordered result is slug → permalink and no unrelated payload causes a
      derived write or unnecessary dependency work.
- [ ] `[e2e]` Verify create/update mutations persist the coordinated final values in Directus for
      non-conventional and multiple independent field keys.

### `src/sluggernaut-hook/mutation/item-hooks.ts`

- [ ] `[unit]` Verify item filter registration covers create, single update, bulk create, bulk
      update, and item deletion with the expected Directus event names.
- [ ] `[unit]` Verify unrelated updates pass through without field reads or derived writes.
- [ ] `[unit]` Verify required-field reads are minimal, deduplicated, use accountability, and use
      `eventContext.database`/knex for the same mutation transaction.
- [ ] `[unit]` Verify create and bulk-create payload validation rejects non-object bulk items and
      coordinates each valid item independently.
- [ ] `[unit]` Verify update and bulk-update handling rejects ambiguous multi-item derivation rather
      than applying one derived value to all items; unrelated bulk updates remain allowed.
- [ ] `[unit]` Verify invalid configuration warnings are structured and do not disable unrelated
      valid fields.
- [ ] `[unit]` Verify redirect processing is gated globally and by the deterministic selected
      interface, skips initial creation/stable canonical values, and applies at most one plan.
- [ ] `[unit]` Verify delete processing deactivates only managed records and archive processing
      handles archive, explicit unarchive, unchanged values, and manual state overrides.
- [ ] `[unit]` Verify arbitrary `status`/publication values do not trigger lifecycle handling unless
      Directus collection archive metadata explicitly declares them.
- [ ] `[unit]` Verify redirect store/service failures are visible and do not incorrectly suppress
      slug/permalink derivation.
- [ ] `[e2e]` Verify create, update, delete, archive, unarchive, bulk, and transaction behavior
      against the supported Directus event lifecycle, including rollback/failed-mutation behavior.

### `src/sluggernaut-hook/redirects/planner.ts`

- [ ] `[unit]` Cover global/interface redirect gating as planner inputs, first-interface selection,
      disabled-first precedence, and permalink-over-slug precedence.
- [ ] `[unit]` Cover no plan for initial create, null canonical sides, unchanged canonical values,
      and canonical changes that produce exactly one redirect.
- [ ] `[unit]` Cover managed 301/active/provenance fields, all source metadata, and null lifecycle
      reason.
- [ ] `[unit]` Cover chain flattening across multiple owned records, only same-source ownership,
      cross-item ownership conflicts, and manual/unowned conflicts without failing content mutation.
- [ ] `[unit]` Cover canonical reversion, old-origin rewrites, self-loop prevention, and
      deactivation rather than creation when origin equals destination.
- [ ] `[unit]` Cover deletion vs archive deactivation, archive-only reactivation, manual records,
      already-inactive records, and manual activation-state override clearing suspension metadata.
- [ ] `[unit]` Cover scheduled redirect dates as preserved data and ensure automatic creation does
      not invent start/end dates.

### `src/sluggernaut-hook/redirects/service.ts`

- [ ] `[unit]` Cover parsing of every compatible redirect field, string/number IDs, nullable dates,
      provenance, lifecycle reasons, and rejection of malformed/incompatible records.
- [ ] `[unit]` Verify relevant-read filters include the configured old/new canonical values and do
      not load unrelated redirect history unnecessarily.
- [ ] `[unit]` Verify managed-history reads filter by source collection/item and never infer
      ownership from matching URLs.
- [ ] `[unit]` Verify create mapping preserves 301, active state, dates, and all provenance; verify
      rewrite/deactivation update mappings and operation ordering.
- [ ] `[unit]` Verify manual redirect conflict records are not overwritten or deleted.
- [ ] `[unit]` Verify service calls receive the transaction-bound store and errors are surfaced with
      structured context.
- [ ] `[e2e]` Verify persisted redirect records contain the expected public fields/provenance and
      remain auditable after source deletion.

### `src/sluggernaut-hook/redirects/store.ts`

- [ ] `[unit]` Verify the configured collection, schema, null accountability, and supplied knex
      transaction are passed to `ItemsService`.
- [ ] `[unit]` Verify `getSchema` is awaited once and service construction failures are propagated.
- [ ] `[e2e]` Verify custom redirect collection names are used for reads/writes in a real Directus
      mutation.

### `src/sluggernaut-hook/index.ts`

- [ ] `[unit]` Verify disabled startup calls setup start/end and registers no startup, invalidation,
      or item hooks.
- [ ] `[unit]` Verify enabled startup validates options, creates one shared field cache with the
      configured TTL/database, registers all three subsystems, and closes lifecycle bookkeeping.
- [ ] `[unit]` Verify validation/setup failures do not leave a partially registered hook.
- [ ] `[e2e]` Verify the built hook loads once and all five bundle entries remain available in the
      packed consumer.

### `src/sluggernaut-recalculate/options.schema.ts`

- [ ] `[unit]` Cover trimmed/non-empty collection, optional exact field-key arrays, default
      `createRedirects=true`, explicit false, duplicate/blank keys, and unknown-key rejection.

### `src/sluggernaut-recalculate/validation.ts`

- [ ] `[unit]` Verify root/null/admin/admin-access accountability is accepted, ordinary users are
      forbidden, malformed options fail at the boundary, and valid options receive schema defaults.
- [ ] `[e2e]` Verify a non-admin cannot run the operation and an authorized administrator can run it
      only with valid inputs.

### `src/sluggernaut-recalculate/handler.ts`

- [ ] `[unit]` Verify collection configuration is discovered once, standalone permalinks are
      skipped, derived fields are selected strictly, and unknown requested fields are ignored.
- [ ] `[unit]` Verify slug-before-permalink dependency ordering, permalink-only stored-slug input,
      slug-only no-dependent-update, and initial null-to-value backfill.
- [ ] `[unit]` Verify pagination uses bounded pages, stable primary-key ordering, does not load the
      collection unbounded, and handles a short terminal page.
- [ ] `[unit]` Verify primary-key discovery, invalid/missing item IDs, no-op items, per-item update
      failures, continued processing after failures, and bounded
      `{ processed, updated, skipped, failed }` statistics/logging.
- [ ] `[unit]` Verify `createRedirects=true` uses the item service/hooks and false bypasses redirect
      generation while writing through the transaction database.
- [ ] `[unit]` Verify empty selected scope exits without item reads and redirect-global-disabled
      behavior remains correct.
- [ ] `[e2e]` Verify a large enough fixture proves paging, exact field scope, dependent ordering,
      per-item failure accounting, redirect opt-out, and redirect creation during recalculation.

### `src/sluggernaut-recalculate/api.ts`

- [ ] `[unit]` Verify disabled extension returns zero statistics without validation/service work,
      enabled operation validates options and environment, and setup ends on success and failure.
- [ ] `[unit]` Verify the operation passes validated environment options and context through to the
      handler exactly once.
- [ ] `[e2e]` Verify the operation is loadable under the declared Directus operation entry and
      returns bounded statistics.

### `src/sluggernaut-recalculate/index.ts`

- [ ] `[unit]` Assert operation ID/name/description/icon, required collection option, JSON field
      allowlist option, redirect default, and overview output for omitted/selected fields and false
      redirect creation.
- [ ] `[e2e]` Verify Studio exposes the operation with the documented name and options.

### `src/shims.d.ts`

- [ ] `[unit]` Add a typecheck/build guard that the declaration shim does not mask missing runtime
      modules or permit app/server boundary imports that would fail in the packed artifact.

## Existing test files audited — no duplicate task items

The following existing tests were reviewed and their covered cases are intentionally not repeated
above:

- `__tests__/bundle.test.ts` — IDs and environment defaults.
- `__tests__/configuration.test.ts` — basic ordering, duplicate warning, invalid permalink
  reference, standalone permalink, and missing source reference.
- `__tests__/hook-registration.test.ts` — basic startup schema/policy registration, invalidation
  event registration, and unavailable-collection policy skip.
- `__tests__/link-display.test.ts` — basic path/host/href/null helper behavior.
- `__tests__/mutation-coordinator.test.ts` — basic create ordering, null source, stable/sync
  permalink, null synchronized permalink, explicit values, standalone permalink, and two recalculate
  scope cases.
- `__tests__/normalization.test.ts` — basic slug, falsy resolution, path, prefix, boundary, trailing
  slash, manual prefix, and host behavior.
- `__tests__/redirect-planner.test.ts` — basic source precedence, canonical normalization, create,
  chain flattening, managed-origin update, ownership conflict, self-loop conflict, and lifecycle.
- `__tests__/redirect-service.test.ts` — basic compatible reads, plan application, managed-history
  reads, and lifecycle writes.
- `__tests__/validation.test.ts` — basic operation defaults/unknown keys, field metadata, and link
  option boundary validation.

## Spec and implementation-plan reconciliation

### Specification section 80 — unit requirements

- [x] Slug basics, arbitrary keys, locale/lowercase, explicit override, null/falsy handling,
      independent fields, stable/synchronized permalinks, explicit slug selection, standalone mode,
      path/prefix/trailing-slash normalization, canonical source precedence, basic redirect
      planning, managed provenance/lifecycle, display helpers, and basic recalculation scope are
      represented by existing tests plus the outstanding file-specific tasks above.
- [ ] Complete the remaining unit matrix: `updateOnSourceChange=false`, empty/whitespace source
      transitions, all invalid path classes, all option/schema defaults and invalid inputs, multiple
      independent interfaces, full redirect gates/conflicts/reversion/manual override, component
      actions/locking, configuration cache/adapter/transaction behavior, policy/schema
      reconciliation, operation authorization/pagination/failure statistics, and
      registration/package contracts.

### Specification section 81 — E2E requirements

- [ ] Add real-Directus coverage for item create/update/null-source, independent slug/permalink
      interfaces, duplicate warnings, first-interface redirect selection, permalink-over-slug
      precedence, chain/reversion behavior, delete/archive/unarchive/manual preservation, compatible
      schema reuse and idempotence, custom collection names, both policies and no auto-assignment,
      recalculation/backfill/scope/redirect opt-out, API writes despite Studio locks, transaction
      behavior, and bulk mutation behavior.

### Specification sections 82–83 and implementation phases 1–6

- [ ] Make the package/packed-consumer checks prove the five entrypoints and runtime dependencies;
      make documentation validation prove README/skill coverage; and record the repository gates
      separately from behavioral tests.
- [ ] Before marking complete, map every implementation-phase exit criterion to passing unit or E2E
      evidence, especially schema/policy idempotence, safe incompatible-collection behavior,
      structured failures/logging, bounded recalculation, and clean packed-consumer loading.

### Known test-plan gaps not visible in the current implementation files

- [ ] `[e2e]` Add a fixture proving v1 hierarchy/namespace/system-metadata behavior is not invoked
      by v2 and that arbitrary application status fields do not trigger archive lifecycle logic.
- [ ] `[e2e]` Add rollback/atomicity evidence for derived fields plus redirect writes when the
      supported Directus event transaction fails; document the exact limitation if Directus cannot
      provide this guarantee.
- [ ] `[e2e]` Add a concurrent/startup lock scenario for schema and policy registration, not just
      sequential idempotence.

## Completion rule

The checklist is complete only when every unchecked task above has an implemented test, every
existing test remains non-duplicative, all 33 E2E requirements in the specification have evidence,
and the repository’s required test/build/package gates are recorded with exact commands.
