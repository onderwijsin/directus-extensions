# Sluggernaut test plan

This document is the implementation-ready test plan for `extensions/directus-sluggernaut-bundle`. It
covers the refactored v2 bundle through unit, component, integration, packed-consumer, and real
Directus end-to-end tests. It is a plan only: the cases below are not implemented by this document.

The highest-priority contract is data integrity. A test is not complete merely because a request
returns successfully: it must verify the final item, the redirect history, provenance, lifecycle
state, and the absence of collateral changes.

## Test layers and evidence rules

- `[unit]` Pure normalization, schemas, discovery, planning, mapping, validation, and failure
  decisions. These tests must be deterministic and use arbitrary field names.
- `[component]` Vue interface, display, and configuration-picker behavior in the Vue Vitest project.
- `[integration]` Built package, process, filesystem/cache coordination, and packed-consumer checks.
- `[e2e]` A built bundle loaded by a real Directus instance. These are the source of truth for item
  mutations, permissions, transactions, lifecycle hooks, Flow execution, and persisted redirect
  records.
- `[manual]` A repeatable operator check for Studio behavior or a deployment concern that cannot be
  reliably automated yet. Manual cases still require recorded input, expected output, and
  screenshots/logs or API evidence.

Do not promote a passing mock to E2E evidence. Every E2E fixture must use non-conventional field
keys, own its collections/items/configuration, and clean up in `finally` blocks. Keep within the
Directus Core E2E limits: no more than 25 collections, five flows, and two ephemeral non-root users
at one time.

### Directus Core CI capability constraint

The CI E2E project runs on the Directus Core plan. Core does not provide granular RBAC, including
row-level or field-level permission rules. A policy seed that contains restricted resources such as
`custom_permission_rules_enabled` may therefore log a `RESOURCE_RESTRICTED`/403 error and leave the
policy absent. That is an expected CI capability limitation, not a Sluggernaut startup or data
integrity failure.

Core-plan E2E cases must:

- treat the restricted policy-seed error and absent granular policy as expected evidence;
- never require the seeded granular policy to be present in CI;
- run data-integrity and extension behavior assertions with the root administrator or other
  available Core-plan access; and
- mark permission, row-filter, field-filter, and policy-presence assertions as conditional on a
  Directus environment that supports granular RBAC.

The policy seed remains available for non-Core environments. Do not remove the restricted
configuration merely to make Core CI green, and do not convert the expected seed limitation into a
passing policy mock.

## Test oracle: invariants every scenario must check

For each scenario, capture the before and after state of the source item and the configured redirect
collection. Assert the following unless the scenario explicitly says otherwise:

1. Only fields in the mutation payload or derived-field allowlist change.
2. Derived slugs use the final source state, derive before dependent permalinks, and never retain
   stale source material.
3. Explicit values win over derivation but are still normalized and type-validated.
4. A rejected mutation leaves the item and redirect collection unchanged.
5. A redirect is created only for a real canonical transition, has `301`, and contains complete
   provenance: `managed_by`, source collection, item, field, and source type.
6. A managed redirect is changed only when provenance identifies the same source lifecycle. URL
   equality alone never grants ownership.
7. Redirect history has no active self-loop, avoidable chain, duplicate managed origin, or redirect
   to a stale canonical destination.
8. Archive/delete deactivation is distinct from canonical-history updates; scheduled dates and
   unrelated/manual redirect records are preserved.
9. Retry, duplicate delivery, repeated startup, and repeated recalculation are idempotent.
10. Failures are visible in logs/statistics and do not silently report successful data changes.

## Shared fixture

Create one reusable E2E fixture, with scenario-specific additions:

```text
collection: editorial_entries
primary key: entry_id
source fields: headline_text, section_label, locale_code, zero_value, false_value
slug fields: public_route, api_route
permalink fields: canonical_route, alternate_route, standalone_route
unrelated fields: editor_note, publish_state, revision_number
redirect collection: sluggernaut_redirects_e2e
```

Use the actual configured field metadata rather than conventional names in at least half of the
cases. Define `public_route` and `canonical_route` with automatic redirects in separate runs so
source precedence is observable. Add a second collection with the same field keys to detect
cross-collection cache or provenance leakage.

The fixture must support generated and manually overridden values; null, empty, Unicode,
punctuation, long, and adversarial source values; two independent slugs and two independent
generated permalinks; a standalone permalink with no slug dependency; compatible, incompatible,
managed, unmanaged, scheduled, inactive, conflicting, and chained redirect records; archive- enabled
and non-archive collections; and API, SDK, Flow, import, and server-side mutation entry points where
available.

## A. Unit and component coverage

### Configuration, schemas, and registration

- [ ] `[unit]` Assert the five bundle entries, stable IDs, entry types, app/API split, runtime
      dependency boundaries, host range, packed output, and shims that do not mask missing imports.
- [ ] `[unit]` Validate all environment defaults, boolean/TTL/collection-name constraints, global
      schema/data gates, and custom redirect collection substitution.
- [ ] `[unit]` Validate field metadata and interface options, including null/partial metadata,
      arbitrary field keys, invalid source references, duplicate interfaces, unknown keys, and
      standalone permalink defaults.
- [ ] `[unit]` Assert deterministic discovery by interface metadata, field sort, and key tie-break;
      preserve valid independent fields when one configuration is malformed.
- [ ] `[unit]` Verify schema/policy definitions contain expected field types, defaults, filters,
      read-only provenance fields, least-privilege permissions, and no automatic assignment.
- [ ] `[unit]` Verify startup is disabled by each applicable gate, idempotent, lock-aware, and
      non-destructive for compatible collections; incompatible collections warn and do not disable
      slug/permalink derivation.
- [ ] `[unit]` Verify cache hits, TTL expiry, per-collection invalidation, malformed metadata,
      invalidation failures, and event registration for all documented schema changes.

### Slug and permalink algorithms

- [ ] `[unit]` Cover one/multiple source fields, trimming, empty-source removal, source ordering,
      null/undefined, numeric zero, boolean false, Unicode/diacritics, locale variants, lowercase
      on/off, punctuation, separators, repeated hyphens, and empty-result `null`.
- [ ] `[unit]` Cover explicit slug normalization, non-string rejection, update-on-source-change
      true/false, omitted source values resolved from the existing item, and stale-value removal.
- [ ] `[unit]` Cover absolute path normalization, repeated slashes, root, trailing slash policy,
      prefix joining/boundaries, manual prefix validation, and generated/manual divergence.
- [ ] `[unit]` Reject schemes, hosts, protocol-relative URLs, queries, fragments, whitespace,
      backslashes, controls, dot segments, dot-dot segments, malformed prefixes, and malformed
      hosts.
- [ ] `[unit]` Cover generated permalinks from the same-mutation slug, explicit slug selection,
      missing/non-slug/cross-collection references, update-on-slug-change true/false, null slug
      clearing, multiple independent dependencies, and standalone paths.
- [ ] `[unit]` Verify mutation coordination order is slug → permalink and that unrelated payloads do
      not cause derived writes.

### Redirect planning and persistence

- [ ] `[unit]` Verify the first valid permalink is preferred over slug, the first interface remains
      authoritative when disabled, and no later interface silently replaces it.
- [ ] `[unit]` Cover create/no-op/changed canonical/null canonical/reversion transitions and exact
      managed 301 provenance with no invented lifecycle dates.
- [ ] `[unit]` Cover managed-history ownership, old-origin rewrite, multi-hop chain flattening,
      canonical-loop deactivation, self-loop prevention, duplicate-origin prevention, and stable
      retry behavior.
- [ ] `[unit]` Cover unmanaged redirects included/excluded from planning and conflict behavior
      `override`/`block`; manual records must never be deleted or silently re-owned.
- [ ] `[unit]` Cover archive, unarchive, delete, already-inactive records, manual activation
      override, inactive reasons, and scheduled `start_date`/`end_date` preservation.
- [ ] `[unit]` Verify service/store mappings, transaction-bound database handles, configured
      collection names, compatible-record parsing, malformed-record rejection, and structured error
      context.

### Recalculation, interfaces, and display

- [ ] `[unit]` Verify recalculation authorization, option defaults/allowlists, disabled-extension
      behavior, bounded paging, stable primary-key ordering, empty scopes, dependency ordering,
      per-item failures, continuation, and exact statistics.
- [ ] `[unit]` Verify `createRedirects=true/false`, selected slug-only/permalink-only fields,
      unknown fields, standalone fields, and no implicit dependent-field updates.

### Mutation orchestration, adapters, and failure paths

The following cases close the unit-level gaps between pure algorithms and Directus E2E behavior.
Mock the Directus services and transaction handles, but assert calls, arguments, ordering, return
values, thrown errors, and structured log metadata—not only final happy-path values.

- [ ] `[unit]` `mutation/items.ts`: verify `relevantFields` includes every source, derived, and
      slug-reference field exactly once; `hasRelevantPayloadField` distinguishes absent keys from
      present `null`/empty values; and `readExistingItem` passes schema, accountability, transaction
      database, deduplicated fields, and primary key to `ItemsService`.
- [ ] `[unit]` `mutation/items.ts`: verify existing-item read failures and non-record responses
      throw; `resolveSingleUpdateItemKey` accepts scalar string/number keys in a one-element array
      and rejects non-arrays, empty arrays, multi-key arrays, booleans, objects, null, and floats.
- [ ] `[unit]` `mutation/archive.ts`: verify archive metadata is read with null accountability,
      missing/non-record metadata returns `null`, missing/non-string `archive_field` returns `null`,
      and service/schema failures propagate to the caller.
- [ ] `[unit]` `mutation/archive.ts`: cover archive, unarchive, unchanged values, wrong previous
      value, wrong next value, missing archive/unarchive values, equal archive/unarchive values, and
      falsy archive values without confusing a normal status update for a lifecycle transition.
- [ ] `[unit]` `mutation/update.ts`: verify existing fields are read before coordination; archive
      processing is awaited before canonical processing; unrelated updates return the original
      payload without coordination; relevant updates pass the merged next item to canonical
      planning; and every service failure has the documented propagation behavior.
- [ ] `[unit]` `mutation/item-hooks.ts`: verify create, update, bulk-create, bulk-update, delete,
      and archive event registrations; malformed collection keys and payload shapes; empty and
      ambiguous key arrays; unrelated mutations; configuration-warning logging; and cleanup when
      setup or a callback fails.
- [ ] `[unit]` `mutation/item-hooks.ts`: verify redirect processing is skipped when globally
      disabled, when no canonical source is selected, and for initial/stable values; verify at most
      one canonical plan is applied and delete/archive failures are logged or propagated exactly as
      implemented.
- [ ] `[unit]` `mutation/redirects/canonical-redirects.ts`: cover disabled redirects, no selected
      source, null old/new canonical values, unchanged canonical values, redirect-service creation
      failure, relevant-read failure, planner warnings, plan-application failure, configured
      collection forwarding, transaction forwarding, and the exact `redirect-runtime-unavailable`
      warning shape.
- [ ] `[unit]` `mutation/redirects/deletion-redirects.ts`: cover disabled redirects, zero/multiple
      deleted keys, managed-history reads per key, empty histories, lifecycle-plan application,
      service/read/write failures, configured collection forwarding, and transaction forwarding.
- [ ] `[unit]` `mutation/redirects/lifecycle-redirects.ts`: cover disabled redirects, archive and
      unarchive branches, empty histories, service/read/write failures, warning payloads, and the
      guarantee that lifecycle processing never creates or rewrites origins/destinations.
- [ ] `[unit]` `redirects/schema.ts`: validate every required/nullable field, literal managed/type
      constraints, string/number primary keys, nullable dates/reasons, unknown-key rejection, and
      malformed provenance records.
- [ ] `[unit]` `redirects/redirect-operations.ts`: verify compatible-record filtering, relevant
      origin/destination query filters, managed source-ownership filters, empty results, malformed
      rows, create/update/deactivate/reactivate mappings, operation ordering, and first-error
      propagation without silently applying later operations.
- [ ] `[unit]` `redirects/service.ts`: verify the configured collection, schema, null
      accountability, and transaction-bound knex handle reach the `ItemsService`; schema lookup is
      awaited once; construction failures propagate; and the returned service exposes the expected
      operations.
- [ ] `[unit]` `mutation/redirects/*` failure matrix: verify content derivation remains independent
      from optional canonical redirect infrastructure where the implementation promises that
      behavior, while delete/lifecycle error handling is tested separately because those adapters
      have different failure contracts.
- [ ] `[unit]` `recalculate/selection.ts`: cover omitted field allowlists, empty arrays, unknown
      fields, duplicate requested fields, slug-only/permalink-only selections, standalone
      permalinks, primary-key discovery with multiple/null/missing primary markers, and exact
      deduplicated required-field ordering.
- [ ] `[unit]` `recalculate/pages.ts`: cover empty pages, short terminal pages, exactly-full pages,
      multiple pages, non-array service responses, exact `limit`/`offset`/sort arguments, every
      `updated`/`skipped`/`failed` outcome, and processor failure propagation.
- [ ] `[unit]` `recalculate/item.ts`: cover non-record items, missing/null/object/boolean IDs,
      string and numeric IDs, empty updates, derivation errors, service-update mode, direct-
      database mode, database failures, logger messages for `Error` and non-Error values, and exact
      outcome/count semantics.
- [ ] `[unit]` `recalculate/api.ts`: verify setup start/end on disabled, validation failure,
      environment failure, handler success, and handler failure; zero statistics when disabled; and
      exactly-once forwarding of validated options and context.
- [ ] `[unit]` `recalculate/validation.ts`: cover null/internal/admin/admin-access accountability,
      ordinary users, malformed accountability objects, malformed options, defaults, unknown keys,
      and the exact forbidden error boundary.
- [ ] `[unit]` `shared/configuration/locales.ts`: verify the supported locale list is complete,
      values are unique, translations have matching keys, and invalid locale configuration is
      rejected rather than silently selecting an unintended locale.
- [ ] `[unit]` `shared/configuration/helpers`: verify configuration warnings contain stable codes,
      collection/field context, actionable messages, and do not suppress valid independent
      configuration.

Unit tests must not claim to prove transaction atomicity, Directus event semantics, real
permissions, cross-process locking, or concurrent convergence. Those remain covered by the E2E and
integration scenarios below; unit tests should prove the deterministic decisions and adapter
contracts feeding those scenarios.

- [ ] `[component]` Verify slug/permalink locking, unlock/relock, disabled/non-editable states,
      placeholders/locales, null/error rendering, emitted values, and API/Flow/import writes not
      being blocked by the Studio control.
- [ ] `[component]` Verify permalink field selection offers only same-collection Sluggernaut slug
      fields and handles loading, empty, malformed, failed, changed-collection, and cleared
      selections safely.
- [ ] `[component]` Verify link display copies the exact stored path, renders null safely, opens
      only valid HTTP(S) origins with `_blank` and `noopener,noreferrer`, and stays inert for
      malformed options/values.

## B. End-to-end real-life scenario matrix

Each row is a separate scenario or parameterized scenario family. For every row, assert the
invariants above plus the row-specific oracle. “No redirect” means no new or changed managed
redirect—not that unrelated pre-existing redirects disappear.

### B1. Basic content creation and source resolution

| ID  | Scenario                                                                                                     | Expected result                                                                                                                      |
| --- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| E01 | Create with one normal headline                                                                              | Slug and generated permalink are derived and persisted in dependency order; no redirect is created for initial canonical assignment. |
| E02 | Create with two source fields                                                                                | Trimmed non-empty values join in configured order; both derived fields use the same final slug.                                      |
| E03 | Create with source values `null`, `undefined`, `""`, whitespace, `0`, and `false`                            | Presence and falsy values follow the contract; no accidental loss or stringification.                                                |
| E04 | Create with all sources empty or punctuation-only                                                            | Slug and dependent permalink become `null`; item creation remains valid if Directus permits null.                                    |
| E05 | Create with explicit slug and permalink                                                                      | Explicit values win, are normalized, and are not overwritten by source derivation.                                                   |
| E06 | Create with invalid explicit slug/permalink types                                                            | Request fails at the boundary; item and redirects remain unchanged.                                                                  |
| E07 | Create with Unicode/diacritics and each supported locale family                                              | Expected locale behavior is stable; no mojibake, unsafe path, or empty unexpected result.                                            |
| E08 | Create with repeated punctuation, separators, emoji, RTL text, and mixed scripts                             | Output is normalized deterministically and remains a valid slug/path.                                                                |
| E09 | Create with a field key containing spaces, hyphens, `$`, or non-English characters where Directus permits it | Discovery and persistence use metadata keys exactly; no conventional-name assumption.                                                |
| E10 | Create two records with identical source text                                                                | Both records can be created; uniqueness behavior is owned by Directus/schema, not hidden slug mutation.                              |
| E11 | Create with unrelated fields only                                                                            | No derived field or redirect is written; unrelated fields persist unchanged.                                                         |

### B2. Updates, overrides, and dependency behavior

| ID  | Scenario                                                        | Expected result                                                                                                                     |
| --- | --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| E12 | Update one configured source field                              | With `updateOnSourceChange=true`, slug re-derives from final state and generated permalink follows configured synchronization.      |
| E13 | Update unrelated field                                          | Slug/permalink and redirect history remain byte-for-byte unchanged.                                                                 |
| E14 | Update source to empty while another source remains             | Remaining source material is retained; stale removed source text is absent.                                                         |
| E15 | Clear all sources                                               | Slug becomes `null`; synchronized permalink clears; redirect behavior follows null-canonical rules without inventing a destination. |
| E16 | Update source with `updateOnSourceChange=false`                 | Existing slug is preserved; an explicit slug payload still wins and normalizes.                                                     |
| E17 | Manually unlock and set a custom slug                           | Custom value persists; later unrelated updates do not overwrite it.                                                                 |
| E18 | Change slug with `updateOnSlugChange=false`                     | Existing generated permalink remains unchanged; no redirect is based on a permalink that did not change.                            |
| E19 | Change slug with `updateOnSlugChange=true`                      | Permalink synchronizes, and exactly one canonical transition is planned from old to new.                                            |
| E20 | Explicit permalink override while generated mode is enabled     | Manual path is accepted/rejected according to path and prefix rules; it is not silently regenerated.                                |
| E21 | Manual permalink outside prefix with validation on/off          | Validation on rejects; validation off preserves the valid user path without silently adding the prefix.                             |
| E22 | Toggle trailing-slash policy across generated and manual values | Only configured operations change slash policy; root remains `/`; disabled enforcement preserves a valid manual choice.             |
| E23 | Update both source and explicit dependent fields in one payload | Explicit values win at each field; dependency ordering does not overwrite them.                                                     |
| E24 | Update two independent slugs/permalinks simultaneously          | Each dependency graph is isolated; one invalid graph does not corrupt the valid graph.                                              |
| E25 | Update with omitted source fields and an existing item          | Existing values are used only where the contract requires; no source becomes the string `undefined`.                                |
| E26 | Send invalid path classes through API/SDK/import                | Request fails atomically and the prior item plus redirect history remain unchanged.                                                 |

### B3. Bulk, import, and mutation-entry-point coverage

| ID  | Scenario                                                      | Expected result                                                                                                |
| --- | ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| E27 | Bulk create three heterogeneous records                       | Each item derives independently; one item’s source values cannot bleed into another.                           |
| E28 | Bulk create containing a malformed item                       | The supported Directus behavior is recorded; valid items are not mis-derived and failures are visible.         |
| E29 | Bulk update records with the same source change               | Only supported unambiguous behavior occurs; no single derived value is copied to unrelated items.              |
| E30 | Bulk update with ambiguous keys requiring existing-item reads | Operation rejects the derived mutation rather than applying unsafe shared data.                                |
| E31 | API, SDK, Flow, CSV/import, and server-side writes            | All supported paths invoke the same server authority; Studio lock state does not block them.                   |
| E32 | Duplicate/retried request with identical payload              | Final item and redirect set are unchanged after the first successful application.                              |
| E33 | Failed derived-field write or redirect write                  | Failure is visible; verify the documented atomicity boundary and that no false success is returned.            |
| E34 | Concurrent updates to the same item                           | Record the supported outcome; no impossible mixed slug/permalink pair or orphaned managed redirect may remain. |

### B4. Permalink algorithm matrix

| ID  | Scenario                                                                                          | Expected result                                                                           |
| --- | ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| E35 | Generated path with no prefix, `/news`, `news`, and `/news/`                                      | Equivalent valid prefixes produce one normalized path; invalid prefixes fail safely.      |
| E36 | Generated root/empty/null slug                                                                    | Root and null semantics are explicit; no `//`, `undefined`, or dangling prefix is stored. |
| E37 | Manual `/`, `/a//b`, `/a/b/`, and nested path                                                     | Valid paths normalize exactly according to trailing-slash settings.                       |
| E38 | Manual full URL, protocol-relative URL, query, fragment, backslash, control, `.`/`..`, whitespace | Every invalid class is rejected without changing the item.                                |
| E39 | Prefix boundary `/news` vs `/newspaper`                                                           | Prefix validation does not accept lookalike paths.                                        |
| E40 | Permalink references missing, cross-collection, non-slug, or malformed slug field                 | Invalid configuration is warned and excluded; unrelated valid fields continue to derive.  |
| E41 | Standalone permalink create/update                                                                | It accepts only explicit valid paths and never acquires an implicit slug dependency.      |
| E42 | Two generated permalinks from different slugs                                                     | Each follows its selected slug and update policy; one change does not rewrite the other.  |

### B5. Redirect source selection and canonical transitions

| ID  | Scenario                                                                    | Expected result                                                                           |
| --- | --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| E43 | Redirects disabled globally                                                 | Slug/permalink derivation works; no redirect collection read/write occurs.                |
| E44 | Redirects enabled with automatic slug                                       | First valid enabled slug is the sole canonical source; initial create has no redirect.    |
| E45 | Automatic permalink and automatic slug both configured                      | First valid permalink has precedence over slug.                                           |
| E46 | First discovered permalink disabled, later permalink enabled                | First discovered interface remains the candidate; later interface does not replace it.    |
| E47 | Canonical change from `/old` to `/new`                                      | One active managed `301` is created with complete provenance and no lifecycle dates.      |
| E48 | Canonical value unchanged or unavailable on one side                        | No redirect plan is applied.                                                              |
| E49 | Canonical reversion `/old` → `/new` → `/old`                                | History is rewritten safely; no active self-loop or duplicate managed origin is created.  |
| E50 | Canonical changes multiple times quickly                                    | Latest canonical destination wins and older chains flatten to it.                         |
| E51 | Previous managed redirect exists for same source                            | It is rewritten, not duplicated; ownership fields remain correct.                         |
| E52 | Matching URL exists but provenance belongs to another item/field/collection | It is not treated as owned history.                                                       |
| E53 | Custom redirect collection name                                             | Every runtime read/write targets the configured collection, never hardcoded `redirects`.  |
| E54 | Redirect collection missing/incompatible while derivation is enabled        | Derivation remains usable; redirect failure is visible and does not produce fake history. |

### B6. Redirect chains, conflicts, and integrity attacks

| ID  | Scenario                                                                   | Expected result                                                                                          |
| --- | -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| E55 | Existing chain `/a` → `/b` → `/c`, canonical moves to `/d`                 | Included managed chain is flattened to `/d`; no avoidable multi-hop chain remains.                       |
| E56 | Existing redirect originates at new canonical `/new`                       | It is deactivated as needed to prevent an active loop; unrelated records are preserved.                  |
| E57 | Unmanaged `/old` conflict with behavior `override`                         | The configured conflict policy is applied and recorded; no unmanaged record is deleted.                  |
| E58 | Unmanaged `/old` conflict with behavior `block`                            | Existing conflict is preserved, no managed replacement is created, and warning evidence exists.          |
| E59 | `includeUnmanagedRedirectsInPlanning=false`                                | Unmanaged records do not participate in chain flattening/conflict planning; managed history still works. |
| E60 | Manual redirect with same destination but different origin                 | It remains untouched unless the explicit planning contract includes it.                                  |
| E61 | Redirect with malformed type/provenance/date fields                        | It is rejected or ignored safely; valid history remains intact and diagnostics identify it.              |
| E62 | Duplicate active managed redirects for one origin are pre-seeded           | Mutation does not amplify the duplicate; report the integrity violation and preserve ownership safety.   |
| E63 | Redirect record attempts to impersonate Sluggernaut via URL only           | Provenance checks prevent takeover or rewrite of another source’s history.                               |
| E64 | Redirect destination equals origin, including slash-normalization variants | No active self-loop is persisted.                                                                        |
| E65 | Scheduled redirect with start/end dates is encountered during planning     | Dates are preserved; automatic canonical changes do not invent or erase consumer-owned scheduling.       |

### B7. Archive, unarchive, delete, and manual state management

| ID  | Scenario                                                                    | Expected result                                                                                    |
| --- | --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| E66 | Archive item with active managed history                                    | All active redirects owned by that item/source deactivate with `inactive_reason=archive`.          |
| E67 | Unarchive item after archive                                                | Only records suspended specifically by archive reactivate; deleted/manual/inactive records do not. |
| E68 | Delete item                                                                 | Managed history deactivates with `inactive_reason=delete`; source provenance remains auditable.    |
| E69 | Delete/archive item with no managed history                                 | Source action succeeds with no fabricated redirect updates.                                        |
| E70 | Archive and canonical change in one supported lifecycle sequence            | Final item, lifecycle state, canonical history, and redirect reasons are internally consistent.    |
| E71 | Unarchive after a manual activation-state override                          | Manual override metadata is cleared/applied exactly as documented; no accidental reactivation.     |
| E72 | Non-archive collection with `status`, `published`, or custom boolean fields | Those fields never trigger lifecycle behavior without Directus archive metadata.                   |
| E73 | Repeated archive/delete/unarchive events                                    | Operations are idempotent and do not change inactive reason unexpectedly.                          |

### B8. Schema, policy, cache, and operational behavior

| ID  | Scenario                                                         | Expected result                                                                                                                                                                                                                                                                        |
| --- | ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E74 | Provision empty redirect schema                                  | Collection, fields, and defaults are usable by runtime operations. Policy availability is conditional on the Directus plan.                                                                                                                                                            |
| E75 | Provision twice or start two instances concurrently              | No duplicate schema/policy rows, destructive recreation, or partial registration occurs.                                                                                                                                                                                               |
| E76 | Compatible pre-existing redirect collection                      | It is reused without destructive changes.                                                                                                                                                                                                                                              |
| E77 | Incompatible pre-existing collection                             | Startup warning and safe derivation-only behavior; abort setting is respected.                                                                                                                                                                                                         |
| E78 | Policies enabled individually and together                       | On granular-RBAC environments, the exact policy is registered, least privilege is enforced, and no policy is auto-assigned. On Core CI, the restricted policy seed is expected to be absent after the documented `RESOURCE_RESTRICTED` error; do not assert policy presence.           |
| E79 | Authorized and unauthorized redirect reads/writes                | On granular-RBAC environments, permissions and active-date filters match the schema contract; ordinary users cannot run admin-only recalculation. On Core CI, run root-accessible data-integrity and extension behavior checks and mark granular authorization assertions unavailable. |
| E80 | Change field metadata after cache warm-up                        | Relevant collection invalidates; unrelated collection cache remains valid; new config becomes visible.                                                                                                                                                                                 |
| E81 | Two collections with similar metadata and one cache invalidation | No configuration, field, or redirect provenance leaks across collections.                                                                                                                                                                                                              |
| E82 | Extension disabled, then enabled after restart                   | Disabled instance is inert; enabled instance registers cleanly without stale in-memory state.                                                                                                                                                                                          |
| E83 | Packed package in clean Directus consumer                        | All five entries load, imports resolve, and the E2E matrix can run against the built artifact.                                                                                                                                                                                         |

### B9. Recalculation and repair

| ID  | Scenario                                                         | Expected result                                                                                    |
| --- | ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| E84 | Recalculate all derived fields over more than one page           | Stable primary-key paging processes each item once with bounded memory and exact counts.           |
| E85 | Recalculate selected slug only                                   | Only selected slug changes; dependent permalink is not implicitly changed.                         |
| E86 | Recalculate selected permalink only                              | It uses stored/current slug input according to contract; unrelated slug stays unchanged.           |
| E87 | Recalculate both slug and permalink                              | Dependency order is correct and final pair is coherent.                                            |
| E88 | Recalculate standalone permalink                                 | Only explicit/standalone behavior applies.                                                         |
| E89 | Recalculate with `createRedirects=true`                          | Canonical transitions create/repair redirects through the supported mutation path.                 |
| E90 | Recalculate with `createRedirects=false`                         | Derived fields update but redirect history is not created or changed by recalculation.             |
| E91 | One item fails validation or update in the middle of a page      | Processing continues; failed count/logging identify the item; successful items remain correct.     |
| E92 | Recalculate empty selection, unknown fields, or empty collection | No unnecessary item reads; bounded zero/skip statistics are returned.                              |
| E93 | Run recalculation twice                                          | Second run is a no-op for items, redirects, counts, and audit fields except documented statistics. |

### B10. Bot/adversarial and data-integrity scenarios

These cases model imports, crawlers, malicious clients, flaky workers, and automation rather than a
human carefully using Studio.

| ID   | Scenario                                                                                                         | Expected result                                                                                                                                                                                                                      |
| ---- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| E94  | Submit maximum practical title length and repeated punctuation                                                   | No crash, truncation surprise, unsafe path, or non-deterministic output; document any Directus field limit.                                                                                                                          |
| E95  | Submit HTML, Markdown, SQL-like text, template syntax, null bytes, control characters, and bidi markers          | Values are treated as data; unsafe path classes reject; no log injection or code execution occurs.                                                                                                                                   |
| E96  | Submit absolute URLs, protocol-relative URLs, encoded traversal, double-encoded traversal, and mixed slash forms | No host/query/fragment/traversal value reaches stored permalink or redirect origin/destination.                                                                                                                                      |
| E97  | Send rapidly repeated updates that alternate canonical values                                                    | Final item and redirect graph converge to the last committed state without loops or orphaned active redirects.                                                                                                                       |
| E98  | Replay the same webhook/import batch after partial network timeout                                               | Retry is safe; no duplicate managed history or cross-item source ownership appears.                                                                                                                                                  |
| E99  | Concurrent workers recalculate and mutate the same collection                                                    | No lost updates outside documented transaction semantics; conflicts/failures are observable.                                                                                                                                         |
| E100 | Attempt to write read-only redirect provenance/lifecycle fields directly                                         | On granular-RBAC environments, Directus permissions/schema and extension behavior prevent unauthorized provenance forgery. On Core CI, assert schema and extension-side protection only; do not require granular policy enforcement. |
| E101 | Attempt cross-collection slug reference and cross-item redirect provenance forgery                               | Configuration is rejected/ignored and existing history is not taken over.                                                                                                                                                            |
| E102 | Use non-ASCII field keys, reordered metadata, null sort values, and duplicate interfaces                         | Discovery remains deterministic across restart and process order.                                                                                                                                                                    |
| E103 | Kill/fail a request at each redirect persistence step, then retry                                                | Document transaction/rollback behavior; no silently half-applied state is accepted as success.                                                                                                                                       |
| E104 | Run startup/recalculation during schema invalidation                                                             | No stale configuration causes unsafe derivation; lock/cache behavior is visible in logs.                                                                                                                                             |

## C. Failure, rollback, and transaction evidence

The E2E suite must deliberately inject or induce failures at these boundaries:

- invalid field configuration;
- item read failure;
- derived item update failure;
- redirect collection read/create/update failure;
- archive/delete lifecycle failure;
- schema/policy provisioning failure;
- cache invalidation failure;
- Flow authorization or malformed operation input failure.

For each failure, record whether Directus rolls back the item, the derived fields, and redirect
writes together. If the event model cannot guarantee all-or-nothing behavior, the test plan must
state the exact partial-write boundary and require an operator repair/recalculation procedure. Never
mark a failure case passed because an error was logged if persisted state is inconsistent.

## D. Test data and assertions to retain

Every E2E case should retain enough evidence to diagnose a bot-created data-integrity issue:

- request entry point, payload, actor/accountability, collection, item key, and timestamp;
- pre-mutation item and redirect snapshots;
- response/error and relevant Directus/extension log lines;
- post-mutation item and redirect snapshots, including all provenance and lifecycle columns;
- graph check of active `origin → destination` edges for loops, chains, duplicate origins, and stale
  destinations;
- cleanup result and any records intentionally left for forensic review.

Use exact path comparisons after normalization. Do not assert only on rendered Studio values.

## E. Execution order and completion gates

Run in this order so failures narrow quickly:

1. `[unit]` normalization, schemas, discovery, coordinator, planner, service, validation;
2. `[component]` interfaces, picker, and display;
3. `[integration]` build, package metadata, cache/process/packed-consumer checks;
4. `[e2e]` E01–E42 algorithm and mutation matrix;
5. `[e2e]` E43–E73 redirect and lifecycle matrix;
6. `[e2e]` E74–E93 operational and recalculation matrix;
7. `[e2e]` E94–E104 adversarial, concurrency, retry, and failure matrix;
8. repository validation and diff review.

Required repository checks for the eventual implementation are:

```text
corepack pnpm format
corepack pnpm build:utils
corepack pnpm lint:fix
corepack pnpm typecheck
corepack pnpm test:unit
corepack pnpm test:integration       # when process/packed checks are added
corepack pnpm test:e2e                # when Directus E2E checks are added
git diff --check
```

The plan is complete when every matrix ID has recorded evidence, all documented invariants pass,
rollback limitations are explicit, the packed artifact is tested, and no existing unit test is
counted as E2E evidence by implication. A future implementation task should also update the package
README and consumer skill if testable public behavior changes; this documentation-only update does
not require a Changeset.
