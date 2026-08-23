# Sluggernaut Redirects

## 1. Abstract

Sluggernaut's redirect functionality should evolve from an automatic redirect-history mechanism into
a coherent redirect domain that supports both Sluggernaut-managed canonical history and manually
authored redirects. This should remain part of the existing `sluggernaut-hook`; a second hook
extension would create unnecessary ownership ambiguity around the shared redirect schema and domain
rules. Internally, however, direct redirect mutations should be isolated from the existing
slug/permalink mutation and canonical-history logic.

Automatic redirects remain unchanged in purpose: Sluggernaut creates and maintains exact `301`
redirects when canonical slugs or permalinks change. Manual redirects may be either exact or
pattern-based. Pattern matching uses a deliberately restricted route-pattern grammar: named
parameters, optional parameters, wildcards, optional wildcards, and simple static suffixes. Raw or
constrained regular expressions are explicitly out of scope.

The redirect collection becomes a protected domain model. Mutation hooks validate direct writes,
prevent duplicate active exact origins and cycles, validate pattern/template compatibility, and
derive pattern metadata. All `is_active=true` redirects participate in integrity checks regardless
of scheduling dates; inactive redirects are ignored until reactivated.

Pattern precedence is deterministic and backend-owned. Exact redirects always outrank patterns.
Pattern specificity is calculated from route structure at mutation time and persisted as a 64-bit
integer, allowing ordinary database sorting and pagination. A default query hook injects semantic
ordering when callers provide no explicit sort, while Studio and API consumers remain free to
override sorting.

Sluggernaut-owned redirects remain editable. Manual structural changes transfer ownership away from
Sluggernaut, while operational changes such as activation or scheduling preserve ownership.

---

## Decisions incorporated after review

The following decisions refine and supersede the relevant parts of the original proposal.

### Release state and migration

Sluggernaut has not been released with this redirect schema, so no legacy-data migration or backfill
is required. PR 1 only needs to provision the new schema for new installations and reconcile the
not-yet-released development state.

### Concurrency guarantee

Active exact-origin uniqueness and exact-cycle prevention remain application-level, best-effort
checks. This plan does not add database uniqueness constraints, partial indexes, advisory locks, or
other concurrency enforcement. Concurrent writes may still bypass validation and create duplicates
or cycles, as can already happen in the current automatic implementation. This limitation must be
documented for consumers and covered by focused tests where practical.

### Exact normalization

Exact origins use the existing permalink normalization rules and remain path-only, rejecting
schemes, hosts, protocol-relative URLs, query strings, fragments, whitespace, control characters,
backslashes, and dot-segment traversal while normalizing repeated slashes. Exact destinations may be
either such an internal path or a valid absolute `http:`/`https:` URL; external destinations may
contain query strings and fragments and terminate exact-graph traversal. Sluggernaut does not add or
remove trailing slashes. A consumer that requires trailing slashes must add them when applying the
redirect.

### Audit fields and required relations

Add the standard non-default Directus audit fields:

- `user_created`: nullable UUID, `special: ["user-created"]`, foreign key to `directus_users.id`;
- `date_created`: non-null timestamp, `special: ["date-created"]`;
- `user_updated`: nullable UUID, `special: ["user-updated"]`, foreign key to `directus_users.id`;
  and
- `date_updated`: nullable timestamp, `special: ["date-updated"]`.

The schema definition must include the field-level foreign-key metadata and these two `relations`
entries:

`json [   {     "collection": "<configured redirects collection>",     "field": "user_created",     "related_collection": "directus_users",     "schema": {       "column": "user_created",       "foreign_key_table": "directus_users",       "foreign_key_column": "id",       "on_update": "NO ACTION",       "on_delete": "NO ACTION"     },     "meta": {       "many_field": "user_created",       "one_collection": "directus_users",       "one_deselect_action": "nullify"     }   },   {     "collection": "<configured redirects collection>",     "field": "user_updated",     "related_collection": "directus_users",     "schema": {       "column": "user_updated",       "foreign_key_table": "directus_users",       "foreign_key_column": "id",       "on_update": "NO ACTION",       "on_delete": "NO ACTION"     },     "meta": {       "many_field": "user_updated",       "one_collection": "directus_users",       "one_deselect_action": "nullify"     }   } ] `
The actual generated constraint names may be database-specific. The relation targets must continue
to work when `SLUGGERNAUT_REDIRECTS_COLLECTION` is customized. The read-active policy must expose
`start_date` and `end_date` in addition to `id`, `origin`, and `destination`, especially because
consumers may need `end_date`.

### Bulk mutation contract

`createMany` is treated as sequential `createOne` behavior. The additional bulk concerns apply to
`updateMany`.

For `updateMany`, resolve every targeted record and materialize every complete resulting record from
the shared update payload. Validate the resulting records as one mutation set:

1. validate each resulting record;
2. compare it with non-targeted records in the database;
3. compare all resulting records with one another for duplicate exact origins and equivalent active
   patterns; and
4. construct the complete resulting active exact graph, including edges between records in the
   mutation, before cycle validation.

The preflight should happen before persistence. The implementation must verify Directus' actual
transaction and rollback behavior before promising all-or-nothing semantics. If the event shape
cannot provide enough information for safe preflight, reject the mutation rather than silently
performing partial validation.

### Restricted pattern parser contract

The public pattern language is intentionally narrow. Raw regular expressions, custom parser options,
and arbitrary regex syntax are not part of the public API.

A pattern origin is path-only and consists of slash-separated segments:

`text pattern           = "/" segment ("/" segment)* segment           = static | required-param | optional-param | wildcard | optional-wildcard required-param   = ":" name [static-suffix] optional-param  = ":" name "?" wildcard         = "*" optional-wildcard = "*?" name             = letter (letter | digit | "_")* static-suffix    = literal text within the same segment, for example ".pdf" `
The parser contract is:

- static segments match literally;
- a required named parameter matches one non-empty path segment;
- an optional named parameter omits its complete segment when absent;
- a required wildcard matches one or more complete path segments;
- an optional wildcard matches zero or more complete path segments;
- wildcards never match a partial segment;
- a static suffix is literal and belongs to the same segment as its required parameter;
- at most one wildcard is allowed;
- parameter names must be unique and match the grammar above;
- a pattern must contain at least one dynamic token;
- query strings, fragments, raw `RegExp` values, regex constraints, regex groups, alternatives,
  duplicate names, malformed names, and partial-segment optional markers are rejected; and
- trailing-slash behavior is the same as exact redirects: Sluggernaut does not add or remove one.

Pattern origins may contain at most 20 slash-separated segments so specificity remains lossless in
the 64-bit field. The derived matcher signature is stored in a 512-character field, which
accommodates the full accepted 255-character origin length and its signature markers.

Supported examples are:

`text /legacy/:slug /:category/:slug /:slug? /files/* /files/*? /files/:name.pdf ` A static route
such as `/foo/bar` is stored as `match: "exact"`.

Destinations are path-only templates. Named interpolation must reference a named origin capture;
wildcard interpolation uses `*`. An optional capture may only feed an optional destination position.
A required destination capture backed by an optional origin capture is rejected. A destination that
would produce an empty segment or malformed path when an optional capture is absent is also
rejected. Matcher generation, destination validation, signatures, specificity, and tests must all
use the same parser contract.

### Specificity representation

`specificity` uses the standard Directus `bigInteger` schema with 64-bit integer precision. Runtime
code must preserve it as `bigint` or a decimal string at boundaries and must never coerce arbitrary
64-bit values to an unsafe JavaScript `number`.

The conceptual lexicographic precedence remains:

`text STATIC

> REQUIRED PARAM + STATIC SUFFIX REQUIRED PARAM END OPTIONAL PARAM WILDCARD OPTIONAL WILDCARD `
> Before implementation, prove that a lossless encoding fits within 64 bits for the accepted maximum
> route length. If it does not, Stage 0 must select a compatible alternative such as a sortable
> string or multiple ordering fields. Silent truncation is prohibited.

### Backend-owned ordering — Stage 0 completed

Stage 0 has been validated against the supported Directus 12 E2E stack and local database using a
temporary isolated hook extension. The `items.query` filter can inject the default sort when the
caller provides no explicit `sort`, and it preserves an explicit caller sort.

The verified implementation used:

```text
match ASC
specificity DESC
id ASC
```

The E2E test confirmed exact records precede pattern records, pattern specificity orders descending,
and an explicit `sort=origin` overrides the default. The temporary extension and fixture were
removed after validation.

The Stage 0 result supports continuing with a redirect-specific query hook for PR 4. The eventual
implementation must still verify bigint representation, nullable-field ordering, pagination
stability, permission projections, and the effect on internal planner reads in the Sluggernaut
collection itself.

# 2. Specification

## Architecture

Keep a **single `sluggernaut-hook` extension** and establish the redirect subsystem as a shared
internal domain.

Conceptually:

```text
sluggernaut-hook
│
├── content mutations
│   └── automatic canonical redirect history
│
└── redirect domain
    ├── schema and service
    ├── domain
    │   ├── normalization, state, ownership, and integrity
    │   └── pattern parsing/ranking
    ├── history
    │   ├── planner and persistence operations
    │   └── canonical, lifecycle, and deletion workflows
    └── direct-mutations
        └── exact mutation hooks and mutation-source context
```

The existing canonical redirect planner remains responsible only for automatic canonical-history
management. It must not gain regex/pattern-routing responsibilities.

Direct mutations of the redirect collection use dedicated redirect-domain hooks.

The current implementation maps this architecture to:

```text
src/sluggernaut-hook/redirects/
├── schema.ts
├── service.ts
├── domain/
├── history/
└── direct-mutations/
```

`service.ts` is shared by history workflows and direct mutation hooks. `history/` contains the
automatic redirect-history planner, persistence operations, and canonical/lifecycle/deletion
workflows. `direct-mutations/` contains Directus-bound exact mutation validation and the
request-local internal mutation-source context.

---

## Redirect data model

Preserve the existing fields and add standard Directus audit fields plus matching metadata.

Recommended resulting model:

```ts
{
  id

  origin
  destination
  type

  match // 'exact' | 'pattern'
  specificity // bigint | null
  matcher_signature // string | null

  is_active
  start_date
  end_date

  managed_by
  source_collection
  source_item
  source_field
  source_type
  inactive_reason

  user_created
  date_created
  user_updated
  date_updated
}
```

### Audit fields

Provision the conventional Directus fields:

- `user_created`
- `date_created`
- `user_updated`
- `date_updated`

Sluggernaut system writes naturally have no associated user. Manual changes should be reflected
through the normal Directus audit behavior.

### Matching metadata

`match`:

```ts
'exact' | 'pattern'
```

Default: `exact`.

`matcher_signature` and `specificity` are system-derived, read-only implementation fields.

For exact redirects:

```text
matcher_signature = null
specificity = null
```

For pattern redirects, both are derived whenever the pattern origin changes.

---

## Automatic redirect history

Automatic redirects remain **exact-only**.

Every automatically created redirect must have:

```ts
{
  match: 'exact',
  type: 301,
  managed_by: 'sluggernaut',
}
```

The automatic planner should operate exclusively on exact redirects.

Pattern redirects must never participate in:

- canonical origin conflict resolution;
- canonical chain flattening;
- canonical loop handling;
- archive/delete ownership lifecycle;
- automatic rewrites.

Existing unmanaged **exact** redirects may continue participating according to the existing
`includeUnmanagedRedirectsInPlanning` and conflict settings.

---

# Ownership

Sluggernaut-managed redirects remain manually editable.

However, a **manual structural edit transfers ownership away from Sluggernaut**.

Structural fields are:

```text
origin
destination
match
type
```

When a human/direct external mutation changes one of these fields on a managed redirect, clear
Sluggernaut ownership/provenance:

```text
managed_by = null
source_collection = null
source_item = null
source_field = null
source_type = null
inactive_reason = null
```

Operational edits preserve ownership:

```text
is_active
start_date
end_date
```

Internal mutations performed by Sluggernaut itself must not trigger ownership transfer.

---

# Exact redirect integrity

Direct mutation hooks must protect the active exact redirect graph.

An exact redirect uses literal matching. Pattern syntax such as `:` and `*` is invalid in an exact
origin.

### Unique active origin

At most one active exact redirect may have a given normalized origin.

```text
/a → /b
/a → /c
```

cannot both have `is_active=true`.

All `is_active=true` records are considered participating regardless of their start/end dates.

Therefore scheduled redirects reserve their origin immediately.

Inactive records do not participate until reactivation.

### Cycle prevention

Active exact redirects must form an acyclic graph.

Reject:

```text
/a → /a
```

and:

```text
/a → /b
/b → /a
```

and longer equivalents.

Cycle validation must also run when an inactive redirect is reactivated.

External destinations naturally terminate traversal.

---

# Pattern feature scope

Pattern redirects are manually authored redirects only.

Supported syntax should intentionally remain narrow.

In scope:

```text
/legacy/:slug
/:category/:slug
/:slug?
/files/*
/files/*?
/files/:name.pdf
```

Support:

- static segments;
- required named parameters;
- optional named parameters;
- one wildcard;
- optional wildcard;
- simple static suffixes.

Out of scope:

- raw `RegExp`;
- custom regex constraints;
- arbitrary regex groups;
- suffix alternatives such as `(jpg|png)`;
- query-string matching;
- duplicate parameter names;
- multiple wildcards.

A pattern redirect must actually contain pattern semantics. A static route such as `/foo/bar` should
be stored as `match: 'exact'`.

Pattern origins are path-only; query strings do not form part of pattern matching.

---

# Pattern destination validation

Destination templates may reuse values captured by the origin.

Valid:

```text
origin:      /legacy/:slug
destination: /articles/:slug
```

Invalid:

```text
origin:      /legacy/:slug
destination: /articles/:id
```

Wildcard interpolation must likewise be backed by a source wildcard.

Optional captures must remain safe:

```text
origin:      /guides/:version?
destination: /docs/:version
```

is invalid because the destination requires a value the origin does not guarantee.

Pattern mutation validation therefore operates on the **complete resulting pattern record**,
including existing values during partial updates.

---

# Pattern equivalence

Derive a matcher signature that removes irrelevant parameter names while preserving matching
structure.

For example:

```text
/foo/:id
/foo/:slug
```

produce equivalent signatures.

Two participating patterns with equivalent match semantics should not coexist.

Inactive equivalent records may exist, but reactivation must perform the conflict check again.

---

# Pattern specificity

Specificity is intrinsic to a pattern and is calculated on write.

It is persisted as a signed/unsigned **64-bit integer** suitable for normal database sorting.

Ranking is determined left-to-right, with more constrained route elements outranking less
constrained ones.

Conceptual order:

```text
STATIC
>
REQUIRED PARAM + STATIC SUFFIX
>
REQUIRED PARAM
>
END
>
OPTIONAL PARAM
>
WILDCARD
>
OPTIONAL WILDCARD
```

For example:

```text
/legacy/archive
/legacy/:slug.pdf
/legacy/:slug
/legacy/:slug?
/legacy/*
/legacy/*?
```

must rank in that order.

The integer encoding is an implementation detail, but it must preserve the intended lexicographic
route comparison.

No runtime pattern parsing should be necessary merely to order persisted redirects.

---

# Default redirect ordering

The redirect collection remains an ordinary Directus collection and Studio remains freely sortable.

Add a redirect-specific query hook.

When the caller **does not provide an explicit sort**, inject the semantic default:

```text
1. exact redirects
2. pattern redirects by specificity DESC
3. deterministic final tie-breaker, e.g. id ASC
```

If the caller explicitly supplies `sort`, leave it untouched.

This provides deterministic first-match precedence without preventing administrative sorting.

An exact concrete route may overlap a broader pattern:

```text
exact:   /legacy/archive
pattern: /legacy/:slug
```

This is allowed because exact matching always has higher precedence.

---

# Mutation semantics

Redirect-domain validation should apply to direct redirect collection mutations regardless of
whether they originate from:

- Studio;
- REST/GraphQL API;
- Flow;
- import;
- other extensions.

For partial pattern updates, resolve the complete resulting pattern definition before validation.

For exact updates, resolve whatever existing state is required for duplicate/cycle checks.

Bulk mutations require per-record resolution only where the existing record state can change the
validity of the shared payload.

---

# Activity and scheduling

The integrity model is intentionally conservative.

```text
is_active = false
```

means the record does not participate in uniqueness, equivalence, or graph integrity.

```text
is_active = true
```

means it **does participate**, regardless of:

```text
start_date
end_date
```

This prevents a future schedule from silently activating an invalid redirect configuration without a
mutation occurring at that moment.

---

# Out of scope

This expansion should not attempt to solve:

- arbitrary regex redirects;
- pattern-to-pattern cycle detection;
- automatic redirect generation using patterns;
- temporal overlap analysis between schedules;
- automatic route-specificity inference beyond the supported grammar;
- manual precedence overrides;
- programmable URL rewriting.

---

# 3. PR plan

I would split this into **four PRs**.

## PR 1 — Prepare the redirect domain

**Goal:** Make the current Sluggernaut implementation structurally ready for manual exact/pattern
integrity work without changing its existing redirect behavior.

### Scope

Introduce the future data model:

- `match`, defaulting to `exact`;
- nullable 64-bit `specificity`;
- nullable `matcher_signature`;
- Directus audit fields:

  - `user_created`
  - `date_created`
  - `user_updated`
  - `date_updated`.

Fix the existing `inactive_reason` schema/runtime mismatch.

Update:

- schema provisioning;
- Zod redirect schemas;
- `REDIRECT_FIELDS`;
- managed redirect creation.

Every existing automatically generated redirect must explicitly become:

```ts
match: 'exact'
```

Refactor the existing automatic planner and redirect helpers so they operate explicitly on **exact
redirects only**.

Establish internal domain boundaries/modules for:

```text
redirect schema/types
automatic canonical history
direct redirect mutation behavior
```

but do **not** implement the new mutation guards or pattern support yet.

Pattern-specific fields remain system-owned and unused/null.

### Success criterion

After this PR, existing Sluggernaut behavior is functionally unchanged, but the current
canonical-history implementation is fully insulated from subsequent manual redirect/pattern work.

---

## PR 2 — Protect direct exact redirect mutations

Implementation handoff for the bulk-preflight work:
[`SLUGGERNAUT_REDIRECTS_PR2C.md`](./SLUGGERNAUT_REDIRECTS_PR2C.md).

**Goal:** Make the redirect collection itself integrity-safe before adding patterns.

### Scope

Add dedicated redirect collection mutation hooks.

The direct exact adapter belongs under `redirects/direct-mutations/`; it must reuse the shared
`redirects/service.ts`. Automatic canonical, lifecycle, and deletion workflows belong under
`redirects/history/`, while pure exact decisions remain under `redirects/domain/`.

Implement exact redirect:

- normalization;
- structural validation;
- active-origin uniqueness;
- self-loop prevention;
- indirect cycle prevention;
- activation validation.

Apply the conservative activity model:

```text
is_active=true  → participates regardless of dates
is_active=false → ignored
```

Implement ownership transfer:

- manual changes to `origin`, `destination`, `match`, or `type` detach a Sluggernaut-managed record;
- activation/scheduling changes preserve ownership;
- internal Sluggernaut mutations bypass ownership transfer.

Handle partial and bulk updates correctly by resolving existing state where necessary.

PR 2C adds the `updateMany` preflight: every target is resolved and materialized, the resulting
mutation set is checked for intra-batch and relevant graph conflicts, and the filter rejects before
persistence when integrity cannot be established. This remains application-level, best-effort
validation under concurrency and does not add database uniqueness or rollback guarantees.

### Success criterion

The redirect collection can safely support arbitrary manual **exact** CRUD without relying on the
canonical-history planner to preserve integrity.

---

## PR 3 — Add restricted pattern redirects

**Goal:** Introduce the complete pattern redirect domain without changing read/query ordering yet.

### Scope

Implement the restricted grammar with a purpose-built parser; no third-party pattern-parser
dependency is required.

Implement the restricted pattern grammar:

- named parameters;
- optional parameters;
- wildcard;
- optional wildcard;
- simple static suffixes.

Reject unsupported regex-like constructs.

Implement:

- pattern origin validation;
- destination capture validation;
- optional capture safety;
- duplicate parameter rejection;
- multiple wildcard rejection;
- matcher signature generation;
- equivalent active-pattern conflict detection.

Implement deterministic **64-bit specificity encoding** from pattern structure and persist it on
create/update.

Pattern redirects must always be unmanaged/manual.

Expose `pattern` as a valid `match` option only once the validation layer exists.

### Success criterion

Every persisted active pattern is valid, unambiguous within the supported grammar, carries its
derived matcher metadata, and has a deterministic persisted precedence value.

---

## PR 4 — Make redirect resolution order deterministic

**Goal:** Make ordinary backend reads safe for first-match redirect resolution without compromising
Studio sorting.

### Scope

Add the redirect collection query hook.

When no explicit sort is supplied, inject:

```text
exact first
pattern specificity DESC
stable tie-breaker
```

Explicit caller sorting remains untouched.

Update relevant read permissions/policies if derived fields must be accessible for the injected
query.

Add integration tests covering combined datasets such as:

```text
exact    /legacy/archive
pattern  /legacy/:slug
pattern  /legacy/*
```

and verify deterministic ordering.

Also cover:

- pagination with default ordering;
- explicit sort override;
- inactive records;
- scheduled active records;
- automatic + manual exact records;
- ownership transfer followed by later canonical mutations.

Update the README/domain documentation once the final semantics are stable.

### Success criterion

The complete redirect dataset has a deterministic default resolution order enforced by the backend,
while administrative Directus queries remain normally sortable.

---

I think **PR 1 → exact integrity → patterns → ordering/integration** is the right dependency chain.
In particular, PR 1 leaves the existing automatic subsystem in a state where PRs 2–4 should have
almost no reason to modify the canonical planner again.
