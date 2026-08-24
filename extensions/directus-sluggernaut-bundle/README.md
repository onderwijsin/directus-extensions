# @onderwijsin/directus-sluggernaut-bundle

Directus bundle for field-driven slugs, validated canonical paths, and optional redirect history.
Sluggernaut keeps URL values stable as content changes while remaining independent of the frontend
that serves them.

## Purpose and bundle entries

| Entry                     | Type           | Purpose                                                              |
| ------------------------- | -------------- | -------------------------------------------------------------------- |
| `sluggernaut-slug`        | Interface      | Derives and normalizes a slug from configured string source fields.  |
| `sluggernaut-permalink`   | Interface      | Stores an absolute path, optionally derived from a Sluggernaut slug. |
| `sluggernaut-link`        | Display        | Displays, copies, and optionally opens a stored slug or path.        |
| `sluggernaut-hook`        | Hook           | Derives fields and optionally maintains redirect lifecycle history.  |
| `sluggernaut-recalculate` | Flow operation | Recalculates selected derived fields for an entire collection.       |

When redirects are enabled, a canonical path change creates or rewrites an active managed `301`.
Chains are flattened, and archive/delete transitions deactivate managed history. Explicit field
values and manually created redirects remain supported, but still pass server validation.

The package does not provide a redirect-serving endpoint, frontend router, SEO metadata, URL
shortener, hosting, or role assignment. A separate application, endpoint, reverse proxy, or edge
worker must serve records from the redirect collection.

## Requirements and compatibility

- Directus `>=12.2.0 <13` and Node.js `>=24.10.0`.
- A trusted Directus runtime. The bundle is non-sandboxed and is not a general Marketplace package.
- A string source field for each generated slug and a string field for each Sluggernaut interface.
- A redirect collection when redirects are enabled and schema provisioning is disabled.

## Installation

Install the published package in the Directus runtime and restart Directus:

```sh
pnpm add @onderwijsin/directus-sluggernaut-bundle
```

The package must be installed in the same runtime that loads API extensions. Installing it only in a
Studio project or frontend application does not register the hook or operation.

## Quick start

1. Install the package and restart Directus.
2. Create a collection, for example `articles`, with a string `title` field.
3. Add a string field such as `slug` and select the `Sluggernaut Slug` interface.
4. Set `Source fields` to `title` and keep the default options for a first setup.
5. Optionally add a string field such as `permalink` and select `Sluggernaut Permalink`.
6. Leave `Generate from slug` enabled and select `slug` as the `Slug field`.
7. Create an item with `title: "Hello World"`.

The server stores:

```json
{
  "title": "Hello World",
  "slug": "hello-world",
  "permalink": "/hello-world"
}
```

The Studio inputs start locked. Unlock a field to edit it manually; server-side normalization and
validation remain authoritative for every API, Flow, import, and Studio mutation.

## Redirect consumer

Sluggernaut stores redirects; your application serves them. A minimal consumer should find an active
record, honor its optional date window, and return the stored status code and destination:

```ts
const redirect = await directus.items('redirects').readByQuery({
  filter: {
    _and: [{ origin: { _eq: requestPath } }, { is_active: { _eq: true } }],
  },
  limit: 1,
})

// Apply start_date/end_date in the consumer's timezone policy, then:
// HTTP 301/302/307/308 + Location: redirect.destination
```

For a direct API mutation, an exact manual redirect looks like this:

```http
POST /items/redirects
Content-Type: application/json

{
  "origin": "/old-news",
  "destination": "/news/summer-news",
  "type": 301,
  "match": "exact",
  "is_active": true
}
```

Do not write Sluggernaut-owned provenance fields yourself. When the bundle provisions the
collection, those fields are read-only and maintained by Sluggernaut.

## Configuration

Set these variables in the Directus environment. Boolean and numeric values are parsed by the
extension's configuration schema, so use the value formats supported by your Directus environment
loader.

### Sluggernaut settings

| Variable                                           |     Default | Description                                                                                                                        |
| -------------------------------------------------- | ----------: | ---------------------------------------------------------------------------------------------------------------------------------- |
| `SLUGGERNAUT_ENABLED`                              |      `true` | Master switch for the hook and operation. When false, the operation returns zero counts and the hook registers no behavior.        |
| `SLUGGERNAUT_REDIRECTS_ENABLED`                    |     `false` | Enables redirect creation and archive/delete lifecycle handling. Slug and permalink derivation work independently of this setting. |
| `SLUGGERNAUT_REDIRECTS_COLLECTION`                 | `redirects` | Collection used for managed redirects. Must be a valid Directus collection identifier.                                             |
| `SLUGGERNAUT_MAX_REDIRECT_GRAPH_DEPTH`             |        `25` | Maximum exact-redirect graph expansion depth before a mutation is rejected.                                                        |
| `SLUGGERNAUT_FIELDS_CACHE_TTL_MS`                  |     `60000` | Field metadata cache lifetime in milliseconds. Must be finite and greater than zero.                                               |
| `SLUGGERNAUT_SCHEMA_CHANGES_ENABLED`               |     `false` | Allows Sluggernaut to create or reconcile its redirect collection schema at startup.                                               |
| `SLUGGERNAUT_SCHEMA_ABORT_ON_ERROR`                |      `true` | Stops schema/policy startup processing when provisioning fails.                                                                    |
| `SLUGGERNAUT_MANAGE_REDIRECTS_POLICY_ENABLED`      |     `false` | Enables the optional `Can Manage Redirects` policy definition.                                                                     |
| `SLUGGERNAUT_READ_ACTIVE_REDIRECTS_POLICY_ENABLED` |     `false` | Enables the optional `Can Read Active Redirects` policy definition.                                                                |

Schema changes and policy definitions are opt-in for this bundle. If schema changes remain disabled,
create the configured redirect collection yourself before enabling redirects. If policy definitions
are enabled, they are created but never assigned to a role.

### Shared startup and lock settings

The hook also validates these shared settings. They matter when schema or policy setup runs in more
than one Directus process.

| Variable                                     |  Default | Description                                                                                                     |
| -------------------------------------------- | -------: | --------------------------------------------------------------------------------------------------------------- |
| `DIRECTUS_EXTENSIONS_SCHEMA_CHANGES_ENABLED` |   `true` | Global master switch for extension-owned schema changes. Both this and the Sluggernaut switch must allow setup. |
| `DIRECTUS_EXTENSIONS_DATA_SEED_ENABLED`      |   `true` | Global switch for extension-owned policy/data seeding.                                                          |
| `DIRECTUS_EXTENSIONS_LOCK_PROVIDER`          |    unset | Startup lock provider: `memory`, `redis`, or `fs`. When unset, the synchronization store is used.               |
| `DIRECTUS_EXTENSIONS_LOCK_REDIS_URL`         |    unset | Optional `redis://` or `rediss://` URL for the Redis lock provider.                                             |
| `DIRECTUS_EXTENSIONS_LOCK_FS_DIRECTORY`      |    unset | Shared directory required when the lock provider is `fs`.                                                       |
| `SYNCHRONIZATION_STORE`                      | `memory` | Fallback startup coordination store: `memory` or `redis`.                                                       |

When using Redis, provide `REDIS` as a complete URL, or configure `REDIS_ENABLED=true` together with
`REDIS_HOST`, `REDIS_PORT`, `REDIS_USERNAME`, and `REDIS_PASSWORD`. A complete `REDIS` URL takes
precedence. For multiple Directus instances, use Redis or a shared filesystem lock.

Field metadata is cached for the configured TTL and invalidated when Directus fields are created,
updated, or deleted. Use a shared cache backend such as Redis when multiple Directus instances must
observe field changes consistently.

```dotenv
SLUGGERNAUT_ENABLED=true
SLUGGERNAUT_REDIRECTS_ENABLED=true
SLUGGERNAUT_SCHEMA_CHANGES_ENABLED=true
SLUGGERNAUT_MANAGE_REDIRECTS_POLICY_ENABLED=true
SLUGGERNAUT_READ_ACTIVE_REDIRECTS_POLICY_ENABLED=true
SLUGGERNAUT_REDIRECTS_COLLECTION=redirects

# Use shared coordination when more than one Directus process can start the extension.
DIRECTUS_EXTENSIONS_LOCK_PROVIDER=redis
REDIS=redis://redis:6379
```

## Slug interface

Add a string field and choose `Sluggernaut Slug`.

| Option                                |    Default | Behavior                                                                                                   |
| ------------------------------------- | ---------: | ---------------------------------------------------------------------------------------------------------- |
| `sourceFields`                        |   required | One or more string fields from the same collection. Non-empty values are joined with spaces.               |
| `locale`                              |       `en` | Fixed locale choice used for case conversion.                                                              |
| `lowercase`                           |     `true` | Lowercases the derived slug before separator normalization.                                                |
| `updateOnSourceChange`                |     `true` | Re-derives the slug when a configured source field changes.                                                |
| `automaticRedirects`                  |    `false` | Allows this field to be selected as the canonical redirect source.                                         |
| `includeUnmanagedRedirectsInPlanning` |     `true` | Includes redirects not created by Sluggernaut in chain flattening, loop prevention, and conflict planning. |
| `unmanagedRedirectConflictBehavior`   | `override` | On an included unmanaged conflict, either `override` it or `block` the canonical transition.               |

The Studio locale option is a fixed dropdown. Supported values are `nl`, `en`, `bg`, `de`, `es`,
`fr`, `pt`, `uk`, `vi`, `da`, `nb`, `it`, and `sv`. Custom locale values are not offered by the
interface. The slug input uses a locale-specific generated-value placeholder when available.

For `sourceFields: ["title", "category"]`, `title: "Summer News"`, and `category: "Sports"`:

```text
summer-news-sports
```

Normalization trims empty input, removes combining marks, replaces runs of non-letter/non-digit
characters with `-`, collapses repeated separators, and removes leading/trailing separators. An
empty result is stored as `null`. Explicit slug values use the same normalization.

## Permalink interface

Add a string field and choose `Sluggernaut Permalink`.

| Option                                |    Default | Behavior                                                                                                   |
| ------------------------------------- | ---------: | ---------------------------------------------------------------------------------------------------------- |
| `generateFromSlug`                    |     `true` | Generates the path from a Sluggernaut slug field. Set false for an independent manual path.                |
| `slugField`                           |      unset | Sluggernaut slug field in the same collection. Required when generated.                                    |
| `updateOnSlugChange`                  |    `false` | Updates a generated permalink when its source slug changes.                                                |
| `prefix`                              |      unset | Optional path prefix such as `/news`.                                                                      |
| `validatePrefixOnManualInput`         |    `false` | Rejects manual paths outside the configured prefix.                                                        |
| `trailingSlash`                       |    `false` | Adds a trailing slash to generated non-root paths.                                                         |
| `enforceTrailingSlashOnManualInput`   |    `false` | Applies the trailing-slash policy to manual input.                                                         |
| `automaticRedirects`                  |    `false` | Allows this field to be selected as the canonical redirect source.                                         |
| `includeUnmanagedRedirectsInPlanning` |     `true` | Includes redirects not created by Sluggernaut in chain flattening, loop prevention, and conflict planning. |
| `unmanagedRedirectConflictBehavior`   | `override` | On an included unmanaged conflict, either `override` it or `block` the canonical transition.               |

Example:

```text
prefix: /news
slug: summer-news
generated permalink: /news/summer-news
```

Permalinks are paths, not full URLs. The server rejects schemes, hosts, protocol-relative paths,
query strings, fragments, whitespace, backslashes, control characters, and `.`/`..` path segments.
Repeated slashes are normalized. Prefix and trailing-slash rules apply according to the options
above. When `generateFromSlug` is disabled, slug-derived options are hidden in the Directus field
editor; saved values are preserved if generation is enabled again later.

## Mutation behavior

The hook handles `items.create`, `items.update`, and redirect-related delete/update actions:

- Slugs are derived before permalinks, so a permalink can use a slug created in the same mutation.
- Explicit values win for the mutation, then pass through server normalization.
- On updates, source values come from the payload when present and otherwise from the existing item.
- A permalink is unchanged when its slug changes unless `updateOnSlugChange` is enabled.
- Bulk creates derive each item independently.
- An update requiring one existing item rejects ambiguous multi-item keys.
- Invalid interface configuration is logged as a warning and excluded; unrelated fields continue to
  work.

Invalid explicit values, missing source references, invalid paths, and ambiguous update keys fail at
the mutation boundary. Validate imports and API payloads before retrying them.

## Managed redirects

Redirects are disabled by default. To enable them:

1. Set `SLUGGERNAUT_REDIRECTS_ENABLED=true`.
2. Create the configured redirect collection, or enable both local and global schema changes.
3. Set `automaticRedirects=true` on the canonical slug or permalink field.

Only one field supplies automatic redirects: the first valid permalink in Directus field order with
automatic redirects enabled; otherwise the first valid slug. A later enabled field does not replace
an earlier disabled permalink.

Sluggernaut creates managed `301` records with provenance:

| Field                                                             | Meaning                                                         |
| ----------------------------------------------------------------- | --------------------------------------------------------------- |
| `origin`                                                          | Previous canonical path.                                        |
| `destination`                                                     | New canonical path.                                             |
| `type`                                                            | `301` for managed records.                                      |
| `match`                                                           | `exact` for automatically generated records.                    |
| `specificity`, `matcher_signature`                                | `null` for exact records; derived system metadata for patterns. |
| `is_active`                                                       | Whether your redirect consumer should serve the record.         |
| `start_date`, `end_date`                                          | Optional time window owned by the consumer.                     |
| `managed_by`                                                      | `sluggernaut` for managed records.                              |
| `source_collection`, `source_item`, `source_field`, `source_type` | Provenance for safe rewrites and lifecycle updates.             |
| `inactive_reason`                                                 | `archived` or `deleted` for lifecycle deactivation.             |
| `user_created`, `date_created`, `user_updated`, `date_updated`    | Standard Directus audit fields.                                 |

Direct `create`, single-item `update`, and multi-item `updateMany` writes to the configured redirect
collection are preflighted before persistence. Exact redirects are normalized and checked for
active-origin duplicates, self-loops, and relevant graph cycles. A bulk update resolves every target
and validates the complete proposed mutation set, including conflicts between targets; a missing
target or incomplete preflight rejects the whole filter event before Directus writes. These
application-level checks are best effort under concurrent writes and do not provide a database
uniqueness constraint or distributed lock. Sluggernaut does not promise transaction rollback for
`updateMany` beyond Directus' own transaction behavior.

When Sluggernaut provisions this collection, the provenance and lifecycle fields (`managed_by`,
`source_collection`, `source_item`, `source_field`, `source_type`, `inactive_reason`, `specificity`,
and `matcher_signature`) are read-only and maintained by the bundle. The automatic history planner
currently includes exact-match records only. Direct pattern records are supported with named
parameters (`/legacy/:slug`), optional parameters (`/:slug?`), one wildcard (`/files/*` or
`/files/*?`), and simple parameter suffixes (`/files/:name.pdf`). Pattern destinations are path-only
templates backed by origin captures, and pattern records are always unmanaged/manual. Specificity
and matcher signatures are derived on create and structural update. Pattern origins may contain at
most 20 slash-separated segments so specificity remains lossless in the 64-bit field; derived
matcher signatures are stored in a 512-character field. Redirect reads without an explicit sort
default to exact records first, then pattern specificity descending, then `id` ascending; an
explicit sort is preserved unchanged.

Canonical changes create or rewrite the latest redirect, flatten included redirect chains, and
deactivate included loops. By default, unmanaged redirects are included and the latest canonical
value overrides an unmanaged conflict. Set `includeUnmanagedRedirectsInPlanning=false` to ignore
unmanaged records, or set `unmanagedRedirectConflictBehavior=block` to preserve an included
unmanaged conflict and log a warning. Update-time redirect persistence is in the item mutation flow:
if the redirect collection is unavailable or incompatible, redirect processing is skipped, logged,
and the derived item update still completes. Delete/archive lifecycle failures are logged after the
source action.

Direct `items.create`, single-item `items.update`, and multi-item `items.update` mutations to the
configured redirect collection validate exact redirects before persistence. Origins and internal
destinations are normalized, active exact redirects are checked for duplicate origins, self-loops,
and cycles, and only the relevant origin frontier is read. Pattern origins and destinations are
validated against the restricted grammar and receive derived matcher metadata. Bulk updates resolve
every target and validate the resulting mutation set before Directus writes. External structural
edits to a Sluggernaut-owned redirect clear its provenance; operational changes such as activation
dates preserve ownership. Redirect writes made by Sluggernaut's own history workflow preserve
provenance and local exact validation; the existing history planner remains authoritative for those
internal structural writes. Pattern redirects are always unmanaged/manual and do not participate in
exact graph validation. Direct redirect failures use Directus- compatible errors:
`SLUGGERNAUT_VALIDATION` with status `400` for invalid consumer input and `SLUGGERNAUT_INTEGRITY`
with status `409` for active redirect conflicts. An enabled but unavailable redirect collection
therefore rejects direct redirect mutations rather than silently skipping validation. Unexpected
configuration and internal failures use `SLUGGERNAUT_CONFIGURATION` or `SLUGGERNAUT_INTERNAL` with
status `500`.

The bundle does not serve redirects. A web server, frontend, edge worker, or endpoint must query
active records and issue the HTTP response.

The `match` value determines how an origin is interpreted: exact origins treat `:` and `*` as
literal path characters, while pattern origins reserve them for the documented pattern grammar.

## Link display

Select `Sluggernaut Link` as the display for a slug or permalink field. It shows the stored value
and provides copy. Configure `host` to enable Open:

```text
host: https://www.example.com
stored value: /news/summer-news
opened URL: https://www.example.com/news/summer-news
```

The host must be an `http://` or `https://` origin without credentials, a path, query, or fragment.
Invalid hosts disable Open; they do not invalidate the stored value.

## Flow operation

Add `Sluggernaut: Recalculate Fields` to a Directus Flow:

```json
{
  "collection": "articles",
  "fields": ["slug", "permalink"],
  "createRedirects": true
}
```

| Input             | Required |            Default | Description                                                                                                        |
| ----------------- | -------- | -----------------: | ------------------------------------------------------------------------------------------------------------------ |
| `collection`      | yes      |                  — | Collection to scan.                                                                                                |
| `fields`          | no       | all derived fields | Exact slug/permalink field keys to recalculate. Unknown/non-derived keys are ignored.                              |
| `createRedirects` | no       |             `true` | Uses item-service updates when true and redirects are enabled; otherwise writes directly without redirect history. |

Existing flows using the previous `fieldKeys` option remain supported as a legacy alias; new flows
use `fields`.

The operation returns:

```json
{
  "processed": 125,
  "updated": 119,
  "skipped": 4,
  "failed": 2
}
```

Items are processed in pages of 100. Selecting only a slug does not implicitly recalculate a
dependent permalink. The operation requires administrator or internal system accountability and
rejects other callers with `403 Forbidden`.

## Permissions and security

The hook reads field and collection metadata with system accountability, but item updates read the
existing item using the mutation's accountability. Recalculation is administrator-only because it
can update every item in a collection.

Optional policies are:

- `Can Manage Redirects`: create, read, update, and delete access to the configured redirect
  collection.
- `Can Read Active Redirects`: read access to active records within their optional date window.

Policies are definitions only. Assign them to roles yourself and review whether redirect provenance
should be visible to each role.

## Troubleshooting

### Interfaces are missing

Confirm the package is installed in the Directus runtime, Directus was restarted, and the runtime
satisfies `>=12.2.0 <13`.

### A permalink is ignored

Check that `generateFromSlug` references a Sluggernaut slug field in the same collection. Invalid
options and missing references are logged as warnings and excluded from derivation.

### A changed title does not change the slug

Confirm the title is in `sourceFields` and `updateOnSourceChange=true`. An explicit slug payload
takes precedence for the mutation.

### Redirects are not created

Check `SLUGGERNAUT_REDIRECTS_ENABLED`, the selected field's `automaticRedirects`, and the existence
of `SLUGGERNAUT_REDIRECTS_COLLECTION`. If schema changes are disabled, create the collection
manually or enable schema setup.

### Startup provisioning does not run

Both `SLUGGERNAUT_SCHEMA_CHANGES_ENABLED` and `DIRECTUS_EXTENSIONS_SCHEMA_CHANGES_ENABLED` must be
true. Policy provisioning also requires `DIRECTUS_EXTENSIONS_DATA_SEED_ENABLED=true` and the
relevant policy flag.

## Boundaries

- Directus runtime: `>=12.2.0 <13`.
- Node runtime: `>=24.10.0` as declared by the package.
- Non-sandboxed API hook and operation; deploy only in a trusted Directus runtime.
- Roles and policy assignments are never changed automatically.
- No redirect HTTP endpoint, router integration, frontend package, or external redirect service is
  installed.
