# Changelog

## 0.4.0

### Minor Changes

- a3862c8: Treat exact redirect paths with and without trailing slashes as the same identity and add
  optional persisted redirect trailing-slash normalization.

### Patch Changes

- 027a227: respect readonly interface mode by hiding the unlock button

## 0.3.0

### Minor Changes

- 5a7b9bc: Seed a bundled Sluggernaut Studio Docs article, with an opt-out environment flag.

## 0.2.2

### Patch Changes

- 71aaaeb: Treat Sluggernaut redirect pattern matcher signatures as case-insensitive.
- 6f9a7de: Normalize Sluggernaut pattern origins without non-root trailing slashes.
- 1b69029: Expose the redirect status `type` through the optional active-redirects read policy.

## 0.2.1

### Patch Changes

- 05d2f09: Expose the package main entry point through the Node.js exports map.

## 0.2.0

### Minor Changes

- 3dec1fe: Add a fixed set of locale choices and localized generated-value placeholders to the
  Sluggernaut interfaces.
- 49d8676: Add restricted manual pattern redirects with derived matcher signatures and persisted
  specificity metadata.
- 49d8676: Add backend-owned default ordering for redirect reads: exact redirects first, then
  patterns by descending specificity and stable `id` order.
- 3049381: Add field-level controls for including unmanaged redirects in canonical planning and
  choosing whether unmanaged conflicts block or override the latest canonical value.
- 633f8f9: Scaffold the Sluggernaut V2 Directus bundle and its five extension entries.
- 84a8bf9: Use Directus collection and field selectors for the Sluggernaut recalculation operation.

### Patch Changes

- 79de284: Extend the redirect schema with exact-match metadata and standard Directus audit fields
  while keeping automatic redirect history exact-only.
- 09bf34e: Preflight direct redirect `updateMany` mutations against complete target state and the
  relevant exact redirect graph before persistence.
- f44e974: Add the `withCache` helper with an optional namespace prefix configured through an
  options object, and cache Sluggernaut field configuration reads for a configurable duration with
  collection-scoped invalidation.
- d1293ea: Validate direct exact redirect creates and single-item updates with ownership and
  relevant graph integrity checks.
- 3dec1fe: Add human-readable metadata and read-only provenance fields to the managed redirects
  schema.
- ebba853: Reject encoded and double-encoded traversal segments in manually supplied permalinks.
- 7b37908: Fix slug and permalink updates when redirect lifecycle handling is enabled and collection
  metadata permissions are restricted.
- d92d514: Preserve managed redirect deletion provenance when source items are deleted.
- 4c627cd: Allow literal `:` and `*` characters in exact redirect origins.
- 1164052: Align managed redirect lifecycle reason values with the provisioned schema by using
  `archived` and `deleted` consistently.
- 84a8bf9: Forward the configured locale to the permalink interface input so generated placeholders
  use the selected locale.
- bf6f3ac: Fix redirect-history chain loading, managed ownership transfers, and archive-time
  canonical updates.
- e7830d1: Fix exact redirect integrity for inactive self-loops and numeric source item identifiers.
- f6eda7b: Select the first enabled Sluggernaut slug as the automatic redirect source when no
  permalink is enabled.
- 6f10187: Restore omitted Studio interface defaults when discovering Sluggernaut fields at runtime.
- 3d99bd8: Isolate extension-owned Redis caches with explicit extension and subsystem namespaces.
- 6f10187: Reactivate managed redirects when a canonical URL returns to a previously loop-suppressed
  origin.
- c7f3e95: Refactor Sluggernaut field metadata caching around a setup-scoped field reader and avoid
  archive metadata reads when redirect handling is disabled.
- 2e18469: Use ufo URL primitives to simplify Sluggernaut path normalization while preserving its
  strict permalink validation.
- 3dec1fe: Refine the managed redirects schema with UUID identifiers, constrained status choices,
  and clearer field metadata.
- 3dec1fe: Reject whitespace in manually supplied Sluggernaut permalinks.
- 4fdcdb5: Reject URL credentials in external redirects and malformed percent encoding in
  permalinks.
- 2e18469: Declare Sluggernaut interface option types directly and apply their defaults through the
  Directus interface definitions instead of a dedicated Zod schema.
- b46c777: Remove the unused `regexparam` runtime dependency from Sluggernaut.
- 5835878: Skip recalculation writes when derived Sluggernaut values already match the stored item.
- 5835878: Reject URL-like permalink prefixes, preserve redirect scheduling fields, and reliably
  finish recalculation setup on boundary failures.
- f44e974: Fix sluggernaut mutation edge cases, consolidate field and redirect service plumbing, and
  invalidate schema-derived field caches after Directus schema changes.
- 8bc93ca: Hide slug-derived permalink options when standalone permalink generation is selected.
- b46c777: Increase redirect pattern signature storage and document the pattern specificity
  boundary.
- bd7e88f: Keep derived item mutations successful when the configured redirect collection is
  unavailable or incompatible.
- 23c95ee: Surface unexpected redirect-processing failures and add an opt-out for fail-open mutation
  handling.
- 01bce7c: Return Directus-compatible errors consistently from Sluggernaut validation, redirect
  integrity, configuration, and internal failure paths.
- 2e18469: Select Sluggernaut startup policies by their stable IDs instead of their display names.

## 0.1.0

- Scaffold the Sluggernaut V2 Directus bundle.
