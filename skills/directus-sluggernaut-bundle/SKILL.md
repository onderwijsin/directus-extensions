---
name: directus-sluggernaut-bundle
description: Install, configure, integrate, and operate the Sluggernaut Directus bundle.
---

# Sluggernaut

Use this skill when installing or integrating `@onderwijsin/directus-sluggernaut-bundle` in a
Directus project. Sluggernaut supplies two interfaces, one display, one server hook, and one Flow
operation for field-driven URL values and optional redirect history.

## Contract at a glance

| Entry ID                  | Type           | Consumer contract                                                          |
| ------------------------- | -------------- | -------------------------------------------------------------------------- |
| `sluggernaut-slug`        | Interface      | Normalizes a slug derived from configured string source fields.            |
| `sluggernaut-permalink`   | Interface      | Validates and stores an absolute URL path, optionally derived from a slug. |
| `sluggernaut-link`        | Display        | Displays, copies, and optionally opens a stored path.                      |
| `sluggernaut-hook`        | Hook           | Derives fields on item mutations and optionally maintains redirects.       |
| `sluggernaut-recalculate` | Flow operation | Recalculates selected derived fields for a collection.                     |

The package does not provide a redirect-serving endpoint, frontend router, SEO metadata, URL
shortener, hosting, or role assignment. A separate application, endpoint, reverse proxy, or edge
worker must serve records from the redirect collection.

## Prerequisites and deployment

- Directus 12.2.0 or later within the Directus 12 release line (`>=12.2.0 <13`).
- Node.js `>=24.10.0` in the Directus runtime.
- A trusted self-hosted Directus deployment. The bundle is non-sandboxed and is best suited for
  installation as an npm package. Marketplace availability depends on the instance's trust
  configuration for non-sandboxed extensions.
- Permission to install an npm package in the Directus runtime and restart Directus.
- A string source field for each generated slug.
- A string field for each Sluggernaut slug or permalink interface.
- A redirect collection when redirects are enabled and schema provisioning is disabled.

Install the published package in the Directus runtime:

```sh
pnpm add @onderwijsin/directus-sluggernaut-bundle
```

Restart Directus after installation. Installing the package in a Studio frontend does not register
the API hook or Flow operation.

## Configuration reference

### Extension settings

| Variable                                           |     Default | Accepted values / constraints                             | Effect                                                                              |
| -------------------------------------------------- | ----------: | --------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `SLUGGERNAUT_ENABLED`                              |      `true` | boolean                                                   | Master switch. When false, the hook is inert and recalculation returns zero counts. |
| `SLUGGERNAUT_REDIRECTS_ENABLED`                    |     `false` | boolean                                                   | Enables canonical redirect creation and archive/delete lifecycle handling.          |
| `SLUGGERNAUT_REDIRECTS_COLLECTION`                 | `redirects` | non-empty identifier matching `^[A-Za-z_][A-Za-z0-9_$]*$` | Redirect collection name.                                                           |
| `SLUGGERNAUT_MAX_REDIRECT_GRAPH_DEPTH`             |        `25` | positive integer                                          | Maximum exact-redirect graph expansion depth before a mutation is rejected.         |
| `SLUGGERNAUT_FIELDS_CACHE_TTL_MS`                  |     `60000` | finite positive number                                    | Cache lifetime for field metadata.                                                  |
| `SLUGGERNAUT_SCHEMA_CHANGES_ENABLED`               |     `false` | boolean                                                   | Allows startup schema reconciliation for the redirect collection.                   |
| `SLUGGERNAUT_SCHEMA_ABORT_ON_ERROR`                |      `true` | boolean                                                   | Whether schema/policy startup errors abort provisioning.                            |
| `SLUGGERNAUT_MANAGE_REDIRECTS_POLICY_ENABLED`      |     `false` | boolean                                                   | Enables the manage-redirects policy definition.                                     |
| `SLUGGERNAUT_READ_ACTIVE_REDIRECTS_POLICY_ENABLED` |     `false` | boolean                                                   | Enables the active-redirects read policy definition.                                |

`SLUGGERNAUT_ENABLED` is independent from redirect enablement: leave redirects disabled when you
only need slug/permalink derivation.

### Shared startup and coordination settings

Sluggernaut extends the repository's shared startup schema. These settings affect provisioning or
lock coordination:

| Variable                                     |  Default | Accepted values / constraints | Effect                                                                 |
| -------------------------------------------- | -------: | ----------------------------- | ---------------------------------------------------------------------- |
| `DIRECTUS_EXTENSIONS_SCHEMA_CHANGES_ENABLED` |   `true` | boolean                       | Global schema master switch. Must be true with the Sluggernaut switch. |
| `DIRECTUS_EXTENSIONS_DATA_SEED_ENABLED`      |   `true` | boolean                       | Global policy/data seed switch.                                        |
| `DIRECTUS_EXTENSIONS_LOCK_PROVIDER`          |    unset | `memory`, `redis`, `fs`       | Startup lock provider; falls back to `SYNCHRONIZATION_STORE`.          |
| `DIRECTUS_EXTENSIONS_LOCK_REDIS_URL`         |    unset | `redis://` or `rediss://` URL | Optional Redis lock URL.                                               |
| `DIRECTUS_EXTENSIONS_LOCK_FS_DIRECTORY`      |    unset | non-empty path                | Required for `fs`; shared by contenders.                               |
| `SYNCHRONIZATION_STORE`                      | `memory` | `memory`, `redis`             | Fallback lock provider.                                                |
| `REDIS_ENABLED`                              |  `false` | boolean                       | Enables component-based Redis resolution.                              |
| `REDIS`                                      |    unset | `redis://` or `rediss://` URL | Complete Redis URL; takes precedence over components.                  |
| `REDIS_HOST`                                 |    unset | non-empty host                | Redis component configuration.                                         |
| `REDIS_PORT`                                 |    unset | integer `1`–`65535`           | Redis component configuration.                                         |
| `REDIS_USERNAME`                             |    unset | non-empty string              | Redis component configuration.                                         |
| `REDIS_PASSWORD`                             |    unset | non-empty string              | Redis component configuration.                                         |

`DIRECTUS_EXTENSION_ID` is supplied internally as `sluggernaut`; do not override it. The shared
schema also accepts `DIRECTUS_EXTENSIONS_RATE_LIMITER_STORE`, but Sluggernaut does not use a rate
limiter.

For multiple Directus processes, use a shared Redis or filesystem lock:

```dotenv
SLUGGERNAUT_SCHEMA_CHANGES_ENABLED=true
DIRECTUS_EXTENSIONS_LOCK_PROVIDER=redis
REDIS=redis://redis:6379
```

With no schema provisioning, create a compatible redirect collection yourself. With provisioning,
the default collection is `redirects`; a custom `SLUGGERNAUT_REDIRECTS_COLLECTION` receives the same
schema definition.

Field metadata is cached for `SLUGGERNAUT_FIELDS_CACHE_TTL_MS` and invalidated on Directus
`fields.create`, `fields.update`, and `fields.delete` events. Use a shared Redis cache backend when
field changes must propagate across Directus instances.

## Interfaces

### `sluggernaut-slug`

Create a string field and select `Sluggernaut Slug`.

| Option                                | Required |    Default | Details                                                                                                                     |
| ------------------------------------- | -------- | ---------: | --------------------------------------------------------------------------------------------------------------------------- |
| `sourceFields`                        | yes      |          — | One or more same-collection string fields. Values are trimmed, empty values removed, and the remainder joined with spaces.  |
| `locale`                              | no       |       `en` | Fixed locale choice used by case conversion.                                                                                |
| `lowercase`                           | no       |     `true` | Lowercase before slug separator normalization.                                                                              |
| `updateOnSourceChange`                | no       |     `true` | Re-derive when a configured source field is in an update payload.                                                           |
| `automaticRedirects`                  | no       |    `false` | Opt this field into canonical redirect selection.                                                                           |
| `includeUnmanagedRedirectsInPlanning` | no       |     `true` | Include non-Sluggernaut redirects in chain flattening, loop prevention, and conflict planning.                              |
| `unmanagedRedirectConflictBehavior`   | no       | `override` | For included unmanaged conflicts, use `override` to let the latest canonical value win or `block` to preserve the conflict. |

The Studio locale option is a fixed dropdown; custom values are not offered. Supported values are
`nl`, `en`, `bg`, `de`, `es`, `fr`, `pt`, `uk`, `vi`, `da`, `nb`, `it`, and `sv`. The slug input
uses a locale-specific generated-value placeholder when available.

Example:

```json
{
  "sourceFields": ["title", "category"],
  "locale": "en",
  "lowercase": true,
  "updateOnSourceChange": true,
  "automaticRedirects": false
}
```

```json
{
  "title": "Summer News",
  "category": "Sports"
}
```

```json
{
  "slug": "summer-news-sports"
}
```

Normalization removes combining marks, converts runs of non-letters/non-digits to hyphens, collapses
repeated hyphens, trims hyphens, and represents empty results as `null`. Explicit values are
normalized too. Non-string explicit values are rejected.

### `sluggernaut-permalink`

Create a string field and select `Sluggernaut Permalink`.

| Option                                | Required       |    Default | Details                                                                                                                     |
| ------------------------------------- | -------------- | ---------: | --------------------------------------------------------------------------------------------------------------------------- |
| `generateFromSlug`                    | no             |     `true` | Derive the path from a Sluggernaut slug. Set false for standalone manual paths.                                             |
| `slugField`                           | when generated |      unset | Sluggernaut slug field in the same collection. Invalid references disable this configuration.                               |
| `updateOnSlugChange`                  | no             |    `false` | Synchronize an existing path when the source slug changes.                                                                  |
| `prefix`                              | no             |      unset | Optional normalized path prefix, for example `/news`.                                                                       |
| `validatePrefixOnManualInput`         | no             |    `false` | Reject manual paths outside `prefix` in generated mode.                                                                     |
| `trailingSlash`                       | no             |    `false` | Add a trailing slash to generated non-root paths.                                                                           |
| `enforceTrailingSlashOnManualInput`   | no             |    `false` | Apply the trailing-slash policy to manual values.                                                                           |
| `automaticRedirects`                  | no             |    `false` | Opt this field into canonical redirect selection.                                                                           |
| `includeUnmanagedRedirectsInPlanning` | no             |     `true` | Include non-Sluggernaut redirects in chain flattening, loop prevention, and conflict planning.                              |
| `unmanagedRedirectConflictBehavior`   | no             | `override` | For included unmanaged conflicts, use `override` to let the latest canonical value win or `block` to preserve the conflict. |

Manual permalinks must be absolute paths without whitespace. Schemes, hosts, protocol-relative
paths, query strings, fragments, backslashes, control characters, and `.`/`..` path segments are
also rejected. Repeated slashes are normalized.

When `generateFromSlug` is false, Directus hides the slug-derived options (`slugField`,
`updateOnSlugChange`, `prefix`, and `validatePrefixOnManualInput`). Existing saved values are
preserved and become visible again if generation is re-enabled.

```json
{
  "generateFromSlug": true,
  "slugField": "slug",
  "updateOnSlugChange": true,
  "prefix": "/news",
  "validatePrefixOnManualInput": true,
  "trailingSlash": false,
  "enforceTrailingSlashOnManualInput": false,
  "automaticRedirects": true
}
```

With `slug: "summer-news"`, the generated value is `/news/summer-news`. Permalinks must be absolute
paths beginning with one slash. The server rejects full URLs, protocol-relative paths, schemes,
queries, fragments, backslashes, control characters, and dot segments. Repeated slashes are
collapsed.

### Mutation rules

The hook derives slugs before permalinks and resolves source values against the final item state:

```http
POST /items/articles
Content-Type: application/json

{
  "title": "Hello World"
}
```

Results in the configured derived fields:

```json
{
  "title": "Hello World",
  "slug": "hello-world",
  "permalink": "/hello-world"
}
```

Explicit payload values take precedence, but are still normalized. Existing generated permalinks do
not change when a slug changes unless `updateOnSlugChange=true`. Bulk creates derive each object
independently. Updates requiring an existing item key reject ambiguous multi-item mutations rather
than applying one value to several items.

The hook registers these Directus events:

- `items.create` filter: derives fields for single and bulk creates.
- `items.update` filter: derives fields and processes archive transitions for scalar item updates.
- `items.delete` action: deactivates managed redirect history for deleted item keys.
- `items.update` action on the configured redirect collection: clears a missing inactive reason when
  a redirect is manually reactivated.

Invalid interface options and missing source references are logged as warnings and excluded from
configuration. Invalid explicit values and invalid paths fail the mutation.

## `sluggernaut-link` display

Use `Sluggernaut Link` as the display for a slug or permalink field.

| Option | Default | Details                                                          |
| ------ | ------- | ---------------------------------------------------------------- |
| `host` | unset   | Optional `http://` or `https://` origin used by the Open action. |

```text
host: https://www.example.com
stored value: /news/summer-news
opened URL: https://www.example.com/news/summer-news
```

The host cannot contain credentials, a path, query, or fragment. An invalid host disables Open but
does not invalidate the stored value. Copy remains available when the browser supports the clipboard
API.

## Redirect lifecycle

Redirects require:

```dotenv
SLUGGERNAUT_REDIRECTS_ENABLED=true
```

and `automaticRedirects=true` on the selected source, plus a usable redirect collection. The
canonical source is selected in this order:

1. First valid permalink in Directus field order with automatic redirects enabled.
2. Otherwise, first valid slug in Directus field order with automatic redirects enabled.
3. No redirect handling when neither exists.

A later enabled permalink does not replace an earlier disabled permalink. When a canonical value
changes, Sluggernaut creates or rewrites the latest `301` record, flattens included chains, and
deactivates included loops. By default, unmanaged redirects are included and the latest canonical
value overrides unmanaged conflicts. Set `includeUnmanagedRedirectsInPlanning=false` to ignore
unmanaged records, or set `unmanagedRedirectConflictBehavior=block` to preserve an included
unmanaged conflict and log a warning.

| Redirect field                                                    | Purpose                                                  |
| ----------------------------------------------------------------- | -------------------------------------------------------- |
| `origin`, `destination`                                           | Canonical path transition.                               |
| `type`                                                            | Managed records use `301`.                               |
| `match`                                                           | `exact` for automatically generated records.             |
| `specificity`, `matcher_signature`                                | `null` for exact records; derived metadata for patterns. |
| `is_active`                                                       | Whether a redirect consumer should serve the record.     |
| `start_date`, `end_date`                                          | Optional consumer-controlled time window.                |
| `managed_by`                                                      | `sluggernaut` for managed records.                       |
| `source_collection`, `source_item`, `source_field`, `source_type` | Ownership/provenance metadata.                           |
| `inactive_reason`                                                 | `archived` or `deleted` for lifecycle deactivation.      |
| `user_created`, `date_created`, `user_updated`, `date_updated`    | Standard Directus audit fields.                          |

When the bundle provisions the redirect collection, the provenance and lifecycle fields
(`managed_by`, `source_collection`, `source_item`, `source_field`, `source_type`, and
`inactive_reason`, `specificity`, and `matcher_signature`) are read-only and maintained by
Sluggernaut. The automatic history planner includes exact-match records only. Direct pattern records
support named parameters (`/legacy/:slug`), optional parameters (`/:slug?`), one wildcard
(`/files/*` or `/files/*?`), and simple parameter suffixes (`/files/:name.pdf`). Pattern
destinations are path-only templates backed by origin captures, and pattern records are always
unmanaged/manual. Specificity and matcher signatures are derived on create and structural update.
Redirect reads without an explicit sort use exact records first, then pattern specificity
descending, then `id` ascending; an explicit sort is preserved unchanged.

On source deletion, managed records are deactivated with `inactive_reason=deleted`. When a Directus
archive field transitions to its archive value, records are deactivated with
`inactive_reason=archived`; unarchive reactivates only archive-suspended records. Manual
reactivation clears the inactive reason.

Update-time redirect writes are part of the mutation flow. If the configured redirect collection is
unavailable or incompatible, redirect processing is skipped and logged while the derived item update
continues. Delete/archive action failures are logged after the source mutation and cannot roll back
deletion.

Direct create, single-item update, and multi-item `updateMany` mutations on the configured redirect
collection are validated before persistence when redirects are enabled. Exact redirects normalize
origins and destinations, reject self-loops, duplicate active origins, and cycles, and query only
the relevant active exact graph by origin. `updateMany` resolves every target, materializes the
shared payload against each existing record, compares targets with one another and with relevant
non-targeted records, and rejects when the preflight cannot establish integrity. Pattern origins and
destinations are validated against the restricted grammar and receive derived matcher metadata.
External structural edits to a managed redirect clear its provenance, while operational changes
preserve it. Sluggernaut-generated history writes bypass ownership transfer and use the existing
history planner for structural graph coordination while still receiving local exact validation.
Pattern redirects remain outside exact graph validation. These application-level checks are best
effort under concurrent writes; the bundle adds no database uniqueness constraint or distributed
lock and does not promise rollback for `updateMany` beyond Directus' own transaction behavior.
Direct redirect failures use Directus errors: `SLUGGERNAUT_VALIDATION` (`400`) for invalid consumer
input and `SLUGGERNAUT_INTEGRITY` (`409`) for active redirect conflicts. A missing/incompatible
enabled collection is not silently accepted for direct writes. Unexpected configuration and internal
failures use `SLUGGERNAUT_CONFIGURATION` or `SLUGGERNAUT_INTERNAL` (`500`).

Sluggernaut does not serve these records. A redirect consumer should at minimum filter
`is_active=true`, honor `start_date`/`end_date`, and return the stored `type` and `destination`.

## Recalculation operation

Add `Sluggernaut: Recalculate Fields` to a Flow. The operation API accepts:

```json
{
  "collection": "articles",
  "fields": ["slug", "permalink"],
  "createRedirects": true
}
```

| Input             | Required |            Default | Details                                                                                                            |
| ----------------- | -------- | -----------------: | ------------------------------------------------------------------------------------------------------------------ |
| `collection`      | yes      |                  — | Non-empty collection name.                                                                                         |
| `fields`          | no       | all derived fields | Exact keys. Only configured slug fields and generated-from-slug permalink fields are eligible.                     |
| `createRedirects` | no       |             `true` | Uses item-service updates when true and redirects are enabled; otherwise writes directly without redirect history. |

Existing flows may still send the previous `fieldKeys` option as a legacy alias; new flows should
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

Items are read in pages of 100. Selecting only a slug does not implicitly select its dependent
permalink. Each item failure is counted and logged while the operation continues. Non-administrator
and non-system callers receive `403 Forbidden`; malformed options receive an invalid-options error.
When `SLUGGERNAUT_ENABLED=false`, it returns zero counts without processing items.

## Schema, policies, and permissions

Schema setup is disabled by default. To enable it:

```dotenv
SLUGGERNAUT_SCHEMA_CHANGES_ENABLED=true
DIRECTUS_EXTENSIONS_SCHEMA_CHANGES_ENABLED=true
```

Policy setup additionally requires:

```dotenv
DIRECTUS_EXTENSIONS_DATA_SEED_ENABLED=true
SLUGGERNAUT_MANAGE_REDIRECTS_POLICY_ENABLED=true
SLUGGERNAUT_READ_ACTIVE_REDIRECTS_POLICY_ENABLED=true
```

The optional policy definitions are:

- `Can Manage Redirects`: create/read/update/delete on the configured redirect collection.
- `Can Read Active Redirects`: read active records within the configured date window.

The bundle creates policy definitions but never assigns them to roles. The hook uses system
accountability for schema and metadata operations; item update reads retain mutation accountability.

## Errors and troubleshooting

| Symptom                                | Check                                                                                                                   |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Interfaces are missing                 | Package is installed in the Directus runtime, Directus restarted, and runtime is within `>=12.2.0 <13`.                 |
| Slug is unchanged                      | `sourceFields` contains the changed field and `updateOnSourceChange=true`; explicit slug payloads override derivation.  |
| Permalink is ignored                   | `slugField` points to a valid same-collection Sluggernaut slug; invalid references are excluded with a warning.         |
| Manual permalink fails                 | Use a path without whitespace, not a URL; remove query/fragment/scheme/dot segments and check prefix options.           |
| Redirects are absent                   | Enable the global redirect switch, enable automatic redirects on the selected source, and verify the collection exists. |
| Schema setup is absent                 | Both local and global schema switches must be true. Policy setup also needs the global data-seed switch.                |
| Recalculation is forbidden             | Run with administrator or internal system accountability.                                                               |
| Multi-instance startup is inconsistent | Configure a shared Redis or filesystem lock instead of process-local memory.                                            |

## Boundaries and non-provided infrastructure

- The bundle does not install Directus itself, a Node runtime, Redis, a redirect server, or a web
  router.
- The bundle does not assign policies or roles.
- The bundle does not provide a public redirect route; records require a consumer.
- The bundle does not guarantee atomic rollback for delete/archive action processing after Directus
  emits the action event.
- The bundle is non-sandboxed and must be deployed only where trusted API extensions are allowed.
