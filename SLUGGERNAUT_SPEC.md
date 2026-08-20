# Sluggernaut v2 — Specification

## Status

**Proposed**

Sluggernaut v2 is a ground-up rewrite of the existing `@onderwijsin/directus-bundle-sluggernaut`
extension.

The rewrite should preserve the useful core behaviour of Sluggernaut while deliberately removing
much of the implicit hierarchy, namespace, and publication-state complexity accumulated by v1.

---

## 1. Goals

Sluggernaut v2 provides reusable Directus tooling for:

- automated slug generation;
- editable-but-locked slug fields;
- automated permalink generation;
- editable-but-locked permalink fields;
- configurable permalink prefixes;
- configurable trailing-slash behaviour;
- optional automatic redirect management;
- optional redirect schema registration;
- optional redirect-related policy registration;
- displaying slug/permalink values with copy/open actions;
- recalculating or backfilling derived slug/permalink values through a Directus operation.

The extension should work independently of specific database field names.

A field called:

```text
slug
```

must work exactly as well as:

```text
yolo
```

if both use the Sluggernaut slug interface.

Likewise, a permalink does not need to live in a field named `permalink`.

---

## 2. Package

Proposed package:

```text
@onderwijsin/directus-sluggernaut-bundle
```

Proposed repository location:

```text
extensions/directus-sluggernaut-bundle
```

Target Directus version:

```text
>=12.2.0 <13
```

The package should be implemented as a Directus bundle containing app and server entries.

---

## 3. Bundle entries

Sluggernaut v2 should expose:

```text
sluggernaut-slug
```

Interface for slug fields.

```text
sluggernaut-permalink
```

Interface for permalink fields.

```text
sluggernaut-link
```

Display for slug and permalink fields.

```text
sluggernaut-hook
```

Server-side hook coordinating:

- slug derivation;
- permalink derivation;
- redirect generation;
- redirect lifecycle handling.

```text
sluggernaut-recalculate
```

Directus operation for recalculating derived values.

The server implementation may internally be split into modules/services, but one coordinated
mutation pipeline is preferred over multiple independently reacting hooks.

---

## 4. Core design principles

### 4.1 Field behaviour comes from interfaces

Sluggernaut identifies participating fields through Directus field metadata:

```text
directus_fields.meta.interface
```

It must never depend on conventional field names such as:

```text
slug
path
permalink
```

This allows consumers to use arbitrary field keys.

---

### 4.2 Slugs, permalinks, and redirects are separate capabilities

Sluggernaut should treat these as three independent concerns.

A collection may have:

- only a slug;
- only a manually managed permalink;
- a slug and derived permalink;
- multiple slug fields;
- multiple permalink fields;
- redirects disabled entirely.

Redirect handling must not be required for slug or permalink generation.

---

### 4.3 No hierarchy semantics

Sluggernaut v2 does not model nested content hierarchy.

There is no concept of:

- parent items;
- recursive descendants;
- namespaces;
- collection namespaces;
- inherited paths.

A permalink such as:

```text
/news/archive/example
```

is simply a path string.

Sluggernaut does not care whether `/news` corresponds to another Directus item.

---

## 5. Global configuration

Proposed environment configuration:

```text
SLUGGERNAUT_ENABLED=true

SLUGGERNAUT_REDIRECTS_ENABLED=false
SLUGGERNAUT_REDIRECTS_COLLECTION=redirects

SLUGGERNAUT_SCHEMA_CHANGES_ENABLED=false

SLUGGERNAUT_MANAGE_REDIRECTS_POLICY_ENABLED=false
SLUGGERNAUT_READ_ACTIVE_REDIRECTS_POLICY_ENABLED=false
```

These should additionally respect the repository-wide schema-management configuration provided by
`@onderwijsin/directus-extension-utils`.

For example, automatic schema mutation must still be disabled when:

```text
DIRECTUS_EXTENSIONS_SCHEMA_CHANGES_ENABLED=false
```

even if:

```text
SLUGGERNAUT_SCHEMA_CHANGES_ENABLED=true
```

---

## 6. Environment validation

All Sluggernaut-specific environment configuration should be validated with Zod.

The redirects collection key must be validated as a valid Directus collection identifier.

Default:

```text
SLUGGERNAUT_REDIRECTS_COLLECTION=redirects
```

Every redirect-related subsystem must consume this configured value rather than hardcoding
`redirects`.

That includes:

- schema registration;
- ItemsService access;
- hook configuration;
- runtime schema validation;
- policy registration;
- logging.

---

## 7. Slug interface

Interface ID:

```text
sluggernaut-slug
```

The interface applies to string fields.

### 7.1 Options

Conceptually:

```ts
interface SlugInterfaceOptions {
  /**
   * Fields whose values are combined to generate the slug.
   */
  sourceFields: string[]

  /**
   * Locale used during slugification.
   */
  locale: string

  /**
   * Whether generated slugs should be lowercased.
   */
  lowercase: boolean

  /**
   * Whether changes to source fields should update an existing slug.
   */
  updateOnSourceChange: boolean

  /**
   * Whether this field may act as the automatic slug redirect source.
   *
   * Only effective for the first discovered slug interface.
   */
  automaticRedirects: boolean
}
```

Recommended defaults:

```ts
{
  locale: 'en',
  lowercase: true,
  updateOnSourceChange: true,
  automaticRedirects: false,
}
```

`sourceFields` is required.

---

## 8. Slug interface UX

Slug fields are **not** marked readonly in the Directus schema.

Instead, the custom interface presents them as locked by default.

The interface should provide:

- current slug value;
- copy action;
- lock state;
- unlock action;
- editable input once unlocked;
- relock action if useful.

The lock is purely a Studio UX feature.

It must not prevent:

- API writes;
- Flow writes;
- server-side writes;
- imports;
- SDK usage.

A fresh interface mount should start locked.

Unlocking the UI does not alter the configured automatic-generation behaviour.

---

## 9. Slug generation

### 9.1 Creation

When a new item is created:

1. If an explicit slug value is supplied, that value wins.
2. Otherwise Sluggernaut reads the configured source fields.
3. Non-empty source values are combined.
4. The combined value is slugified.
5. The resulting slug is inserted into the mutation.

An explicitly supplied slug should still pass through the shared slug normalization/validation
logic.

---

## 10. Slug updates

If:

```ts
updateOnSourceChange === true
```

changing any source field causes the slug to be recalculated.

Sluggernaut must calculate from the **final state of all source fields**, not merely from the fields
present in the incoming payload.

Given:

```text
first_name = "remi"
last_name = "huigen"
slug = "remi-huigen"
```

and update:

```json
{
  "first_name": null
}
```

the final source values are:

```text
first_name = null
last_name = "huigen"
```

and the new slug becomes:

```text
huigen
```

---

## 11. Falsy source values

Source-field resolution must use property presence rather than JavaScript truthiness.

Conceptually:

```ts
const finalValue = Object.hasOwn(payload, field) ? payload[field] : existingItem[field]
```

The following source values are omitted from slug generation:

```text
null
undefined
""
whitespace-only strings
```

Non-empty strings participate normally.

If all source values resolve to empty values, the derived slug becomes:

```text
null
```

provided the configured Directus field allows `null`.

Sluggernaut must never retain stale source material merely because an updated source value became
falsy.

---

## 12. Explicit slug mutations

If the payload explicitly contains the slug field itself, that explicit value wins for that
mutation.

Example:

```json
{
  "title": "New title",
  "slug": "custom-slug"
}
```

results in:

```text
custom-slug
```

even if `title` would normally generate another value.

Future automatic source updates may update the slug again if:

```ts
updateOnSourceChange === true
```

The unlocked field is not an implicit permanent opt-out from automation.

---

## 13. Slug uniqueness

Sluggernaut v2 should **not** port v1's random `make_unique` suffix behaviour.

Uniqueness belongs at the data constraint layer.

Consumers requiring unique slugs should configure the Directus/database field appropriately.

Random application-side suffix generation is not a reliable uniqueness mechanism under concurrent
writes.

---

## 14. Multiple slug interfaces

A collection may contain multiple fields using:

```text
sluggernaut-slug
```

All of them participate independently in slug derivation.

Example:

```text
title          -> public_slug
internal_title -> internal_slug
```

Updating `title` may update `public_slug`.

Updating `internal_title` may update `internal_slug`.

Updating both may update both.

This is supported.

However, multiple Sluggernaut interfaces on one collection are considered an advanced configuration
rather than the intended standard setup.

---

## 15. Duplicate-interface warnings

If Sluggernaut discovers more than one slug interface or more than one permalink interface on a
collection, it should emit a prominent warning.

The warning should explain that:

- multiple interfaces are supported for field derivation;
- only the first discovered interface of each type participates in automatic redirect handling;
- duplicate interfaces are not the intended primary configuration;
- consumers should test the configuration carefully;
- behaviour may become more restrictive in a future major release.

This is a warning, not an error.

---

## 16. Determining the first interface

Where a deterministic "first" interface is required, sort using:

1. Directus field `meta.sort`;
2. fields with a null sort value come last;
3. field key lexicographically as a stable tie-breaker.

This ordering must be deterministic across process restarts.

---

## 17. Permalink interface

Interface ID:

```text
sluggernaut-permalink
```

A permalink is an absolute URL path, not an arbitrary string and not an absolute URL.

---

## 18. Permalink options

Conceptually:

```ts
interface PermalinkInterfaceOptions {
  /**
   * Generate the permalink from a Sluggernaut slug field.
   */
  generateFromSlug: boolean

  /**
   * Sluggernaut slug field used as the source.
   */
  slugField?: string

  /**
   * Keep an existing permalink synchronized with future slug changes.
   */
  updateOnSlugChange: boolean

  /**
   * Prefix applied to automatically generated permalink values.
   *
   * @example "/news"
   */
  prefix?: string

  /**
   * Require explicitly entered permalink values to fall inside the prefix.
   */
  validatePrefixOnManualInput: boolean

  /**
   * Whether automatically generated permalinks should end with a slash.
   */
  trailingSlash: boolean

  /**
   * Normalize manually supplied values to the configured trailing slash policy.
   */
  enforceTrailingSlashOnManualInput: boolean

  /**
   * Whether this field may act as the automatic permalink redirect source.
   *
   * Only effective for the first discovered permalink interface.
   */
  automaticRedirects: boolean
}
```

Recommended defaults:

```ts
{
  generateFromSlug: true,
  updateOnSlugChange: false,
  validatePrefixOnManualInput: false,
  trailingSlash: false,
  enforceTrailingSlashOnManualInput: false,
  automaticRedirects: false,
}
```

---

## 19. Choosing the slug source

When:

```ts
generateFromSlug === true
```

a permalink must derive from one specific Sluggernaut slug field.

This is represented by:

```ts
slugField
```

The interface should only offer fields using:

```text
sluggernaut-slug
```

as valid choices.

If exactly one Sluggernaut slug field exists, Studio may preselect it.

If multiple slug fields exist, the consumer must select one explicitly.

Server-side validation must verify that the configured field:

- exists;
- belongs to the same collection;
- still uses the Sluggernaut slug interface.

---

## 20. Initial permalink generation

Given:

```text
slug = hello-world
```

and:

```ts
{
  generateFromSlug: true,
}
```

the initial generated permalink is:

```text
/hello-world
```

Permalink derivation happens **after slug derivation** during a mutation.

This ensures that a newly generated slug can immediately be used by a newly generated permalink.

---

## 21. Explicit permalink values

An explicitly supplied permalink always wins for the current mutation.

Example:

```json
{
  "slug": "hello-world",
  "permalink": "/special/page"
}
```

results in:

```text
/special/page
```

rather than the generated:

```text
/hello-world
```

subject to manual-input validation configured on the permalink interface.

---

## 22. Stable permalinks by default

The default behaviour is:

```ts
updateOnSlugChange: false
```

Therefore:

```text
slug       = hello-world
permalink  = /hello-world
```

followed by:

```text
slug -> changed-title
```

does **not** automatically change the permalink.

The permalink stays:

```text
/hello-world
```

This deliberately separates:

- editable content identifiers;
- long-lived canonical routes.

---

## 23. Permalink synchronization

When:

```ts
updateOnSlugChange === true
```

the permalink follows future slug changes.

Example:

```text
slug       hello-world -> changed-title
permalink  /hello-world -> /changed-title
```

If the permalink itself is explicitly supplied in the same mutation, the explicit value wins.

Future slug updates continue to synchronize the permalink because synchronization is interface
configuration, not per-record state.

---

## 24. Standalone permalinks

A permalink may use:

```ts
generateFromSlug: false
```

In this mode:

- no slug field is required;
- Sluggernaut does not invent a permalink;
- the field uses the locked-editable interface;
- values are still validated as paths;
- trailing slash enforcement may still apply to manual input;
- prefixes are unavailable and ineffective.

---

## 25. Permalink path validation

Every non-null permalink value must represent a valid absolute URL path.

Valid examples:

```text
/
/foo
/foo/bar
/news/2026/hello-world
```

Invalid examples:

```text
foo
https://example.com/foo
//example.com/foo
/foo?bar=baz
/foo#section
/foo\bar
```

Validation must reject:

- missing leading slash;
- schemes;
- hosts;
- protocol-relative URLs;
- query strings;
- fragments;
- backslashes;
- control characters;
- `.` path segments;
- `..` path segments.

Normalization may collapse accidental repeated slashes within the path.

Example:

```text
/news//foo
```

may normalize to:

```text
/news/foo
```

`null` remains valid when the underlying Directus field is nullable.

Validation and normalization must be shared between Studio and server code as much as practical.

Server-side validation remains authoritative.

---

## 26. Permalink prefixes

Prefixes are available only when:

```ts
generateFromSlug === true
```

Example configuration:

```text
prefix = /news
slug = hello-world
```

produces:

```text
/news/hello-world
```

The prefix itself is normalized.

Examples:

```text
news
/news
/news/
```

all normalize to:

```text
/news
```

The root prefix:

```text
/
```

remains `/`.

---

## 27. Prefixes and manual input

Manual permalink input bypasses the configured prefix by default.

Given:

```text
prefix = /news
```

a user may manually enter:

```text
/special/landing-page
```

unless prefix validation is enabled.

When:

```ts
validatePrefixOnManualInput === true
```

manual values must fall underneath the configured prefix.

For prefix:

```text
/news
```

these are valid:

```text
/news/foo
/news/archive/foo
```

these are invalid:

```text
/foo
/newspaper/foo
```

This option performs **validation**.

It should not silently rewrite:

```text
/foo
```

into:

```text
/news/foo
```

---

## 28. Trailing slashes

Automatically generated permalink values respect:

```ts
trailingSlash
```

Examples:

```ts
trailingSlash: false
```

produces:

```text
/news/foo
```

while:

```ts
trailingSlash: true
```

produces:

```text
/news/foo/
```

The root path remains:

```text
/
```

regardless of configuration.

---

## 29. Manual trailing-slash enforcement

When:

```ts
enforceTrailingSlashOnManualInput === true
```

manual permalink values are normalized to the configured `trailingSlash` policy.

Given:

```ts
{
  trailingSlash: true,
  enforceTrailingSlashOnManualInput: true,
}
```

```text
/news/foo
```

becomes:

```text
/news/foo/
```

Given:

```ts
{
  trailingSlash: false,
  enforceTrailingSlashOnManualInput: true,
}
```

```text
/news/foo/
```

becomes:

```text
/news/foo
```

With enforcement disabled, valid manually entered values preserve the user's trailing-slash choice.

---

## 30. Multiple permalink interfaces

Multiple permalink fields may exist on one collection.

They derive independently.

Example:

```text
public_slug   -> public_permalink
preview_slug  -> preview_permalink
```

Both may be recalculated during one mutation.

The same duplicate-interface warning rules apply as for slug fields.

Only the first discovered permalink interface participates in automatic permalink redirect
selection.

---

## 31. Link display

Display ID:

```text
sluggernaut-link
```

The same display should support both:

- slug fields;
- permalink fields.

It should:

- display the complete stored value;
- be null-safe;
- expose a copy action.

---

## 32. Link display host option

The display accepts:

```ts
interface SluggernautLinkDisplayOptions {
  host?: string
}
```

If no host is configured:

```text
/news/foo    [copy]
```

If a host is configured:

```text
/news/foo    [copy] [open ↗]
```

The Open action opens:

```text
host + field value
```

---

## 33. Host validation

`host` should represent an HTTP(S) origin.

Valid:

```text
https://example.com
https://www.example.com
https://example.com/
```

Invalid:

```text
example.com
/foo
https://example.com/base
https://user:pass@example.com
```

The normalized stored/configured host should not contain a trailing slash.

For permalink:

```text
host = https://example.com
value = /news/foo
```

target:

```text
https://example.com/news/foo
```

For slug:

```text
host = https://example.com
value = foo
```

target:

```text
https://example.com/foo
```

The open action must use:

```html
target="_blank" rel="noopener noreferrer"
```

The copy action continues to copy the stored field value, not the generated absolute URL.

---

## 34. Redirect management

Automatic redirects are optional.

They require both:

```text
SLUGGERNAUT_REDIRECTS_ENABLED=true
```

and:

```ts
automaticRedirects: true
```

on the relevant primary interface.

---

## 35. Redirect candidate selection

Automatic redirects are intentionally restricted to avoid multiple fields generating conflicting
canonical URL history.

For every collection:

- all slug interfaces participate in derivation;
- all permalink interfaces participate in derivation;
- only the first slug interface may act as a slug redirect source;
- only the first permalink interface may act as a permalink redirect source.

Importantly, Sluggernaut does **not** search for the first interface with redirects enabled.

If the first permalink interface has:

```ts
automaticRedirects: false
```

the second permalink interface may not take its place.

This keeps behaviour deterministic.

---

## 36. Permalink-over-slug redirect precedence

Redirect source selection follows:

1. first permalink interface;
2. first slug interface.

If the first permalink interface has automatic redirects enabled, permalink becomes the collection's
sole redirect source.

Slug redirect handling is suppressed.

Otherwise, if the first slug interface has automatic redirects enabled, the slug acts as the
redirect source.

A slug canonical URL is represented as:

```text
/${slug}
```

This avoids generating duplicate redirect events where both slug and permalink change during the
same mutation.

---

## 37. Redirect examples

Given:

```text
slug       = foo
permalink  = /news/foo
```

and permalink automatic redirects enabled:

```text
slug foo -> bar
permalink /news/foo -> /news/bar
```

creates exactly:

```text
/news/foo -> /news/bar
```

It does not additionally create:

```text
/foo -> /bar
```

---

## 38. Stable permalink redirect behaviour

Given:

```text
slug       = foo
permalink  = /news/foo
```

and:

```ts
updateOnSlugChange: false
```

changing:

```text
slug foo -> bar
```

while permalink stays:

```text
/news/foo
```

creates no permalink redirect.

The canonical route did not change.

---

## 39. Redirect creation

Automatic redirects are only created when an existing canonical URL changes.

No redirect is created on initial item creation because there is no previous canonical URL.

Automatically generated redirects should use:

```text
type = 301
is_active = true
```

unless future configuration explicitly expands this behaviour.

---

## 40. Redirect collection

The default redirect collection remains:

```text
redirects
```

for compatibility and simplicity.

The collection name is configurable through:

```text
SLUGGERNAUT_REDIRECTS_COLLECTION
```

---

## 41. Redirect schema

The core redirect collection retains the useful public v1 shape:

```text
id
origin
destination
type
is_active
start_date
end_date
```

plus normal Directus activity fields where appropriate.

Sluggernaut v2 additionally requires provenance fields for managed redirects.

Conceptually:

```text
managed_by
source_collection
source_item
source_field
source_type
inactive_reason
```

---

## 42. Managed redirect provenance

Automatically created redirects should carry metadata equivalent to:

```ts
interface SluggernautRedirectMetadata {
  managedBy: 'sluggernaut'
  sourceCollection: string
  sourceItem: string
  sourceField: string
  sourceType: 'slug' | 'permalink'
  inactiveReason: 'archive' | 'delete' | null
}
```

This lets Sluggernaut distinguish redirects it owns from redirects manually created by consumers.

Manual redirects leave these fields unset.

Sluggernaut must never infer ownership merely because a redirect happens to point to the current
item URL.

---

## 43. Redirect chain flattening

Sluggernaut should prevent redirect chains where practical.

Given:

```text
/a -> /b
```

and the canonical route later changes:

```text
/b -> /c
```

the resulting state should be:

```text
/a -> /c
/b -> /c
```

rather than:

```text
/a -> /b -> /c
```

This means existing Sluggernaut-managed redirects whose destination equals the previous canonical
URL should be rewritten to the new canonical URL.

---

## 44. Redirect loops

Sluggernaut must never create:

```text
/foo -> /foo
```

If a redirect origin becomes equal to the current canonical URL because a URL is reused, Sluggernaut
should remove or deactivate the obsolete managed redirect rather than create a loop.

Reversion example:

```text
/a -> /b
```

then canonical URL changes back to:

```text
/a
```

Sluggernaut must ensure `/a` is no longer redirected away from itself.

---

## 45. Existing redirect conflicts

If an automatically generated redirect would use an origin that already exists as a redirect not
owned by the same Sluggernaut lifecycle:

- preserve the existing redirect;
- emit a warning;
- do not fail the content mutation.

Sluggernaut should avoid overwriting human configuration unexpectedly.

---

## 46. Item deletion

Deleting a source item must not delete its redirect history.

Instead, Sluggernaut finds its own managed redirects using provenance metadata and marks them:

```text
is_active = false
inactive_reason = delete
```

The redirect records remain available for:

- auditing;
- manual inspection;
- later migration;
- historical context.

Sluggernaut must not deactivate unrelated manually managed redirects merely because they target the
same URL.

---

## 47. Archive behaviour

Sluggernaut should not attempt to infer arbitrary application publication semantics.

It does not interpret values such as:

```text
status = draft
status = published
status = hidden
```

unless Directus itself explicitly declares the field/value as archive metadata.

---

## 48. Directus-native archive handling

If a collection defines Directus archive configuration through metadata such as:

```text
archive_field
archive_value
unarchive_value
```

Sluggernaut may safely use those explicit semantics.

When an item transitions to the configured archive value:

```text
managed redirects
    -> is_active = false
    -> inactive_reason = archive
```

When an item explicitly transitions back to the configured unarchive value:

```text
managed redirects where inactive_reason = archive
    -> is_active = true
    -> inactive_reason = null
```

Only redirects deactivated specifically by Sluggernaut because of archive state should be
automatically reactivated.

---

## 49. Manual redirect state overrides

If a consumer manually modifies redirect activation state, Sluggernaut should avoid repeatedly
undoing that explicit decision.

Where practical, a manual update to:

```text
is_active
```

should clear:

```text
inactive_reason
```

so the redirect is no longer considered automatically suspended by Sluggernaut.

This creates a distinction between:

- automatic lifecycle state;
- explicit human override.

---

## 50. Scheduled redirects

Sluggernaut preserves support for:

```text
start_date
end_date
```

but automatic redirect creation does not need to populate them.

Automatically created redirects default to immediately active unless lifecycle rules deactivate
them.

---

## 51. Optional redirect schema registration

Sluggernaut may optionally register its redirect collection schema.

Enable through:

```text
SLUGGERNAUT_SCHEMA_CHANGES_ENABLED=true
```

and the repository-wide schema-change gate.

Implementation should use:

```text
@onderwijsin/directus-extension-utils
```

including the shared locking and schema-registration mechanisms.

Schema registration must be:

- idempotent;
- lock-safe;
- non-destructive;
- compatible with existing valid redirect collections.

---

## 52. Existing redirect collections

If the configured redirect collection already exists:

- validate the structure required by Sluggernaut;
- reuse compatible fields;
- add missing fields only when schema registration is enabled and doing so is safe;
- warn clearly about incompatible structural definitions;
- do not destructively recreate the collection.

Runtime redirect features should refuse to operate where required structural fields are
incompatible.

Slug/permalink derivation should continue functioning even if redirect management cannot initialize.

---

## 53. No v1 system metadata

Sluggernaut v2 must not add configuration fields to:

```text
directus_settings
directus_collections
```

The v1 concepts of:

```text
namespace
use_namespace
use_trailing_slash
```

are removed.

Configuration belongs in:

- extension environment variables;
- field interface options.

---

## 54. Policy: Can Manage Redirects

Optional policy registration:

```text
Can Manage Redirects
```

controlled by:

```text
SLUGGERNAUT_MANAGE_REDIRECTS_POLICY_ENABLED
```

The policy should provide appropriate CRUD access to the configured redirect collection.

Conceptually:

```text
create
read
update
delete
```

It must not grant:

- administration;
- unrelated collection permissions;
- role management;
- policy management.

Sluggernaut creates the policy only.

It must not automatically assign it to users or roles.

---

## 55. Policy: Can Read Active Redirects

Optional policy:

```text
Can Read Active Redirects
```

controlled by:

```text
SLUGGERNAUT_READ_ACTIVE_REDIRECTS_POLICY_ENABLED
```

This policy grants read-only access to redirects that are currently effective.

The permission filter should conceptually enforce:

```text
is_active = true

AND
(start_date IS NULL OR start_date <= $NOW)

AND
(end_date IS NULL OR end_date > $NOW)
```

This is intended for frontend or other consumers that need to resolve currently active redirects
without exposing disabled/history records.

It should grant no write access.

---

## 56. Policy registration infrastructure

Policy registration should integrate with the shared policy-registration mechanism being developed
for the extensions repository.

Sluggernaut should not invent a one-off policy management subsystem if a shared repository utility
is available by implementation time.

Requirements:

- stable policy identity;
- idempotent registration;
- no duplicate policy creation;
- no automatic assignment.

If the configured redirect collection is unavailable or incompatible, policy registration should be
skipped with a warning.

---

## 57. Mutation pipeline

Server mutation handling should conceptually follow:

```text
incoming item mutation
        ↓
discover Sluggernaut field configuration
        ↓
read existing values required for derivation
        ↓
resolve every affected slug field
        ↓
resolve every affected permalink field
        ↓
determine primary redirect source
        ↓
compare old/new canonical URL
        ↓
apply at most one redirect plan
        ↓
complete mutation
```

The ordering:

```text
slug
→ permalink
→ redirect
```

is mandatory.

---

## 58. Configuration discovery

Sluggernaut should discover field behaviour from the Directus schema rather than requiring field
keys in environment configuration.

Field interface options are persisted metadata and therefore untrusted input.

Server code should validate interface options with Zod before using them.

Invalid interface configuration should result in clear warnings/errors appropriate to the context
rather than unsafe assumptions.

---

## 59. Configuration caching

Schema/interface discovery may be cached per collection for performance.

The cache should include:

- slug interfaces;
- permalink interfaces;
- deterministic ordering;
- parsed interface configuration;
- redirect candidates.

The cache must be invalidated when relevant Directus field configuration changes.

Correctness takes priority over aggressive caching.

---

## 60. Minimal item reads

On updates, Sluggernaut should only load existing fields required for:

- slug source resolution;
- permalink source resolution;
- old canonical URL;
- Directus archive-state transitions;
- redirect lifecycle handling.

It should avoid fetching entire items unnecessarily.

---

## 61. Transaction semantics

Where Directus hook transaction semantics allow it:

- derived field updates;
- redirect creation;
- redirect rewriting;
- redirect lifecycle updates

should occur inside the same database transaction as the content mutation.

This behaviour should be explicitly verified in E2E tests against the supported Directus version.

If Directus does not expose the necessary transaction semantics for a specific event, the
implementation should document the limitation rather than pretend atomicity exists.

---

## 62. Bulk mutations

Bulk mutation handling must favour correctness over cleverness.

Bulk changes unrelated to Sluggernaut fields should proceed normally.

If a multi-item update requires per-item derivation of:

- slug values;
- permalink values;
- redirects;

Sluggernaut should process items independently where Directus provides enough context to do so
safely.

If Directus mutation semantics make that impossible without ambiguity, the operation should be
rejected rather than applying one incorrectly shared derived value to multiple records.

This behaviour requires explicit E2E coverage.

---

## 63. Recalculate operation

Operation ID:

```text
sluggernaut-recalculate
```

Display name:

```text
Sluggernaut: Recalculate Fields
```

"Reset" should not be used because it implies destructive restoration rather than deterministic
recalculation.

---

## 64. Recalculate operation purpose

The operation force-recalculates derived Sluggernaut values from their current configured sources.

Primary use case:

1. a collection already contains content;
2. a slug field is added and populated;
3. a derived permalink field is added later;
4. existing permalink values remain empty;
5. Recalculate Fields backfills the permalink values.

It should also support deliberate recalculation after configuration changes.

---

## 65. Recalculate configuration

Conceptually:

```ts
interface RecalculateFieldsOptions {
  /**
   * Collection whose items should be processed.
   */
  collection: string

  /**
   * Optional field-key allowlist.
   *
   * When omitted, every derived Sluggernaut field is recalculated.
   */
  fieldKeys?: string[]

  /**
   * Whether canonical URL changes caused by recalculation should
   * participate in normal redirect generation.
   */
  createRedirects: boolean
}
```

Recommended default:

```ts
{
  createRedirects: true,
}
```

---

## 66. Recalculate field scope

Given:

```json
{
  "collection": "articles",
  "fieldKeys": ["permalink"]
}
```

Sluggernaut recalculates only:

```text
articles.permalink
```

It must not implicitly recalculate unrelated slug fields.

If `fieldKeys` is omitted, all derived Sluggernaut fields in the collection may be recalculated.

---

## 67. Derived fields

A slug interface is derived when it has configured:

```text
sourceFields
```

A permalink interface is derived when:

```ts
generateFromSlug === true
```

A standalone permalink using:

```ts
generateFromSlug === false
```

has no deterministic source and therefore cannot be recalculated.

It should be skipped.

---

## 68. Recalculate ordering

For each item, selected fields are processed in dependency order:

```text
selected slug fields
        ↓
selected permalink fields
```

If both a slug and its dependent permalink are selected, the permalink receives the newly
recalculated slug.

If only the permalink is selected, it uses the currently stored slug.

If only the slug is selected, dependent permalinks must **not** be implicitly recalculated.

Field scope is strict.

---

## 69. Recalculate example

Existing item:

```text
title = Hello World
slug = hello-world
permalink = null
```

New permalink interface:

```ts
{
  generateFromSlug: true,
  slugField: 'slug',
  prefix: '/news',
}
```

Operation:

```json
{
  "collection": "articles",
  "fieldKeys": ["permalink"],
  "createRedirects": true
}
```

Result:

```text
permalink = /news/hello-world
```

The slug remains unchanged.

No redirect is created because the old permalink was null.

---

## 70. Redirects during recalculation

Recalculation should normally participate in standard redirect behaviour.

Example:

```text
old permalink = /foo
new permalink = /news/foo
```

with automatic redirects enabled produces:

```text
/foo -> /news/foo
```

When:

```ts
createRedirects === false
```

the recalculated field changes without creating redirect history.

This is useful for controlled migrations where the consumer explicitly does not want historical URL
redirects.

---

## 71. Recalculate implementation

The operation must safely process large collections.

Internally it should:

- paginate records;
- process each item independently;
- avoid loading the full collection into memory;
- produce useful operation output/statistics.

Possible output:

```ts
interface RecalculateFieldsResult {
  processed: number
  updated: number
  skipped: number
  failed: number
}
```

Detailed per-item failures may be logged without returning an unbounded result payload.

The public operation should not initially expose unnecessary concurrency or batching controls.

Those remain implementation details unless future requirements justify configuration.

---

## 72. Shared normalization code

Slug and permalink normalization should use shared pure functions wherever possible.

The same fundamental rules should be reused by:

- app interface preview/validation;
- server hooks;
- Recalculate Fields;
- tests.

Server-side validation remains authoritative.

The app must not be able to produce a value that the server interprets fundamentally differently.

---

## 73. Structured logging

Sluggernaut should use structured logs for notable events including:

- disabled extension;
- invalid interface configuration;
- duplicate slug interfaces;
- duplicate permalink interfaces;
- selected redirect source;
- skipped redirect due to existing conflict;
- incompatible redirect schema;
- lifecycle deactivation;
- schema registration;
- policy registration;
- Recalculate Fields failures.

Normal successful item mutations should not generate excessive log noise.

---

## 74. Migration from v1

Sluggernaut v2 does not require database field renames.

An existing v1 field named:

```text
path
```

may simply switch to:

```text
sluggernaut-permalink
```

The database column can remain named `path`.

The v2 concept is determined by its interface, not by the field key.

---

## 75. Existing hierarchical paths

Existing v1 paths such as:

```text
/news/category/foo
```

remain valid permalink strings.

Sluggernaut v2 simply stops understanding or maintaining their hierarchy.

Consumers can preserve these values and migrate them incrementally.

---

## 76. Existing redirects

A compatible existing:

```text
redirects
```

collection should be reused.

V2 schema registration may add the new provenance fields required for managed redirect lifecycle
behaviour when enabled.

Pre-existing redirects without Sluggernaut provenance should be treated as manual redirects.

Sluggernaut must not automatically claim ownership of them.

---

## 77. Legacy metadata

Legacy v1 fields/configuration such as:

```text
namespace
use_namespace
use_trailing_slash
```

are ignored.

Sluggernaut v2 should not automatically delete them.

Cleanup is a separate migration concern.

---

## 78. Running v1 and v2 together

V1 and v2 server hooks must not run simultaneously against the same content model.

Consumers should remove/disable the v1 Sluggernaut extension before enabling v2.

Otherwise both systems may attempt to mutate slugs, paths, and redirects.

This should be explicitly documented.

---

## 79. Non-goals

Sluggernaut v2 does not implement:

- parent/child content hierarchy;
- recursive descendant permalink updates;
- namespaces;
- collection namespaces;
- automatic interpretation of arbitrary publication/status fields;
- random slug uniqueness;
- automatic redirect deletion;
- automatic user/role policy assignment;
- automatic removal of v1 system metadata;
- automatic migration of v1 interface options;
- automatic historical permalink backfills outside Recalculate Fields;
- frontend redirect execution;
- absolute public URLs stored in permalink fields;
- automatic inference of which of several slug fields a permalink means.

---

## 80. Unit test requirements

At minimum, unit tests should cover:

##### Slugs

- single source field;
- multiple source fields;
- arbitrary field key;
- locale behaviour;
- lowercase option;
- explicit slug override;
- `updateOnSourceChange=false`;
- source field changed to `null`;
- source field changed to empty string;
- source field changed to whitespace;
- one source removed while another remains;
- all sources empty;
- payload property presence versus truthiness;
- multiple independent slug interfaces.

##### Permalinks

- generated from slug;
- arbitrary field key;
- explicitly selected `slugField`;
- multiple slug fields;
- stable permalink by default;
- `updateOnSlugChange=true`;
- explicit permalink override;
- standalone manual permalink;
- path validation;
- path normalization;
- prefix generation;
- prefix normalization;
- prefix validation for manual values;
- manual prefix bypass;
- trailing slash enabled;
- trailing slash disabled;
- manual trailing-slash enforcement;
- root path handling;
- multiple independent permalink interfaces.

##### Redirects

- global redirect gate;
- interface-level redirect gate;
- first-interface selection;
- second interface never becoming redirect source;
- permalink-over-slug precedence;
- single redirect for combined slug/permalink changes;
- no redirect when canonical value remains unchanged;
- no redirect on initial creation;
- chain flattening;
- URL reversion;
- self-loop prevention;
- existing redirect conflict;
- custom redirects collection name;
- managed redirect provenance;
- delete deactivation;
- archive deactivation;
- unarchive reactivation;
- manual redirects unaffected;
- manual activation-state override.

##### Display

- slug without host;
- slug with host;
- permalink without host;
- permalink with host;
- host normalization;
- invalid host;
- null values.

##### Recalculate Fields

- collection scope;
- one field key;
- multiple field keys;
- omitted field keys;
- recalculating slug;
- recalculating permalink;
- dependency ordering;
- permalink-only uses stored slug;
- slug-only does not update permalink;
- standalone permalink skipped;
- initial null-to-value backfill;
- recalculation with redirects;
- recalculation without redirects.

---

## 81. E2E test requirements

E2E tests should run against a real supported Directus instance and cover at least:

1. Creating an item generates a slug.
2. Updating a source field updates its slug.
3. Setting one source field to null removes it from the generated slug.
4. Multiple slug fields update independently.
5. Initial derived permalink generation works.
6. Permalink remains stable after slug change by default.
7. Synchronized permalink follows the slug when configured.
8. Prefix generation works.
9. Manual prefix validation rejects invalid paths.
10. Trailing slash generation and enforcement work.
11. Invalid permalink values are rejected server-side.
12. Multiple permalink interfaces derive correctly.
13. Duplicate interfaces produce warnings.
14. Only the first interface of each type participates in redirects.
15. Permalink redirects suppress duplicate slug redirects.
16. Redirect chains are flattened.
17. Redirect URL reversion does not create loops.
18. Managed redirects deactivate when their source item is deleted.
19. Manual redirects remain untouched when the same item is deleted.
20. Directus-native archive state deactivates managed redirects.
21. Explicit unarchive reactivates only archive-deactivated redirects.
22. Compatible existing redirect collections are reused.
23. Automatic schema registration is idempotent.
24. Custom redirect collection name works.
25. Manage Redirects policy registration is idempotent.
26. Read Active Redirects policy has the expected filter.
27. Policies are not automatically assigned.
28. Recalculate Fields backfills newly added permalink fields.
29. Recalculate Fields honours exact field scope.
30. Recalculate Fields optionally creates redirects.
31. API writes are possible while Studio interfaces remain locked by default.
32. Transaction behaviour is verified for content and redirect mutations.
33. Bulk mutation behaviour is explicitly verified.

---

## 82. Documentation requirements

The package README should document:

- installation;
- environment variables;
- slug interface;
- permalink interface;
- prefixes;
- trailing slash behaviour;
- locking behaviour;
- multiple-interface warning;
- redirect precedence;
- redirect lifecycle;
- custom redirect collection;
- schema registration;
- policies;
- Recalculate Fields;
- v1 migration;
- known limitations.

A consumer skill should likewise describe how an agent should safely configure and use Sluggernaut.

---

## 83. Acceptance criteria

Sluggernaut v2 is complete when:

- slug fields can use arbitrary Directus field keys;
- permalink fields can use arbitrary Directus field keys;
- multiple slug fields derive independently;
- multiple permalink fields derive independently;
- duplicate interface configurations warn prominently;
- only the deterministic first interface of each type participates in redirects;
- falsy source-field updates correctly recalculate slugs;
- permalink values are validated as URL paths;
- prefixes work for slug-derived permalinks;
- optional manual prefix enforcement works;
- trailing-slash generation works;
- optional manual trailing-slash enforcement works;
- slugs and permalinks use locked-editable Studio interfaces;
- permalink changes are stable by default;
- automatic synchronization with slug is opt-in;
- automatic redirects are globally and per-interface configurable;
- a slug + permalink mutation can generate at most one canonical redirect event;
- redirect chains are flattened;
- managed redirects carry provenance;
- deletion deactivates managed redirects without destroying history;
- explicit Directus archive semantics can deactivate and reactivate managed redirects;
- arbitrary application status semantics are not inferred;
- redirect collection name is configurable;
- redirect schema registration is optional and idempotent;
- `Can Manage Redirects` can optionally be registered;
- `Can Read Active Redirects` can optionally be registered;
- policies are never automatically assigned;
- `sluggernaut-link` supports copy and optional host-based open actions;
- `Sluggernaut: Recalculate Fields` can backfill and recalculate scoped derived fields;
- recalculation can optionally suppress redirect generation;
- legacy v1 hierarchy and namespace behaviour is not carried forward;
- unit and E2E coverage proves the behaviour above.
