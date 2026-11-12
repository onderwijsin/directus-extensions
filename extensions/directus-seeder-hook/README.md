# @onderwijsin/directus-seeder-hook

Seed Directus system records and configured application collections from JSON. Extract current data
manually during development, or enable automatic extraction independently for either scope. Imports
are explicit CLI commands: the hook never seeds at startup or applies schema.

## Install

```sh
pnpm add @onderwijsin/directus-seeder-hook
```

Requires Directus `>=12.0.0 <13.0.0`, Node.js `>=24.10.0`, and a trusted, non-sandboxed Directus
installation. Restart Directus after installation. For containers, install the package in the
runtime image or include its built extension directory; see
[including extensions](https://directus.com/docs/self-hosting/including-extensions). Installations
allowing only sandboxed extensions cannot load this hook.

The Directus process needs database and storage access, readable seed JSON and import assets, and
writable extraction and temporary directories. Mount persistent paths yourself. Seeder operations
use Directus services with administrator permissions, independently of a caller's API token.

## Commands and options

```sh
npx directus seed config
npx directus seed system --mode insert-missing
npx directus seed system --mode insert-update --include directus_roles directus_permissions --yes
# Requires core.collections in SEEDER_CONFIG_PATH
npx directus seed core --include categories --yes
DEPLOYMENT_ENV=development npx directus seed extract --scope both --json-only
```

Run imports after database bootstrap and schema setup. In Directus containers without `npx`, invoke
the installed CLI directly:

```sh
docker compose exec directus node /directus/cli.js seed system --mode insert-missing
docker compose exec -e DEPLOYMENT_ENV=development directus node /directus/cli.js seed extract
```

| Option                           | Import: `seed system` / `seed core`                                                                                                            | Export: `seed extract`                                                                  |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `-m, --mode <mode>`              | Override all collection modes with exact `insert-missing`, `insert-update`, or `full-idempotent`. Omitted: use each effective `operationMode`. | —                                                                                       |
| `--full-reset`                   | Bypass management boundaries; every selected collection with a seed file must resolve to `full-idempotent`.                                    | —                                                                                       |
| `-i, --include <collections...>` | Select collections.                                                                                                                            | Select JSON output.                                                                     |
| `-e, --exclude <collections...>` | Exclude collections.                                                                                                                           | Exclude JSON output.                                                                    |
| `-f, --force`, `-y, --yes`       | Skip confirmation prompts, but retain the full-idempotent environment gate.                                                                    | —                                                                                       |
| `--scope <scope>`                | —                                                                                                                                              | Exact `system` (default), `core`, or `both`.                                            |
| `--skip-clean`                   | —                                                                                                                                              | Preserve other output; selected files are still overwritten.                            |
| `--json-only`                    | —                                                                                                                                              | Skip binary reads, downloads, and cleanup.                                              |
| `-a, --assets`                   | —                                                                                                                                              | Enable system binaries even with `SEEDER_JSON_ONLY=true`. Conflicts with `--json-only`. |
| `-h, --help`                     | Show help.                                                                                                                                     | Show help.                                                                              |

CLI collection names are separate space-delimited arguments. Each CLI list replaces its matching
environment list; exclusions win. Selection preserves configured order, and `both` processes system
then core. Neither command accepts a positional seed path; use environment paths. For manual
extraction, selection narrows JSON output only: **cleanup and binary export are not narrowed by
include/exclude**. Core always handles JSON only, including with `--assets`.

### Inspect collection configuration

```sh
npx directus seed config --defaults
npx directus seed config --collection directus_roles
npx directus seed config --collection articles
LOG_LEVEL=silent npx directus seed config | jq '.system.order'
```

`seed config` prints effective collection settings, including resolved modes and management, as JSON
with two-space indentation and one final newline. Output always has `system` and `core`, each with
`order` and `collections`. It ignores import/extraction selection. `--collection` narrows both
scopes to that name, leaving the other empty; an unknown name exits 1. The command accepts no mode,
include, exclude, or scope option. Directus startup can also log to stdout; use `LOG_LEVEL=silent`
when piping JSON. Inspection errors go to stderr and exit 1.

`--defaults` bypasses the consumer file, even if missing or invalid, and shows built-in system
settings and an empty core scope. Startup environment validation still applies. Normal inspection
validates the configured file without falling back to defaults.

Inspection is read-only: no seeds, manifests, relation sources, database/schema access, services,
cache clearing, locks, or output files. It needs no destructive opt-in and works in every deployment
environment. It shows configured settings, not live schema compatibility; verify the target schema
and management inputs before importing.

## Configuration reference

[Directus casts environment values](https://directus.com/docs/configuration/intro) before the hook
validates them once at startup. Booleans must arrive as booleans; numeric `0`/`1` are not booleans.
Integer options require numbers without coercion or truncation. Invalid values fail startup even
when unused or overridden by CLI. `SEEDER_ENABLED=false` skips registration and remaining
validation. Environment changes require a restart.

| Variable                        | Default                         | Accepted value and effect                                                                                                                                                                         |
| ------------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SEEDER_ENABLED`                | `true`                          | Master switch; boolean `false` or string `false` disables all registration.                                                                                                                       |
| `DEPLOYMENT_ENV`                | Unset                           | Untrimmed string. Only exact `development` enables manual/automatic extraction; also controls system import transformations below.                                                                |
| `SEEDER_CONFIG_PATH`            | Unset                           | Nonblank, trimmed path to consumer JSON; relative to the Directus working directory. No file discovery.                                                                                           |
| `SEEDER_SCOPE`                  | `system`                        | Only `system`, case-insensitive without trimming. Choose core via `seed core` or extraction `--scope`.                                                                                            |
| `SEEDER_INCLUDE`                | `[]`                            | One nonblank string or an array; trimmed names. Empty array selects all available collections.                                                                                                    |
| `SEEDER_EXCLUDE`                | `[]`                            | Same list forms; empty array excludes none. Exclusions win.                                                                                                                                       |
| `SEEDER_CONTINUE_ON_ERROR`      | `false`                         | Continue with later collections after an import mutation failure. Either value exits 1 for failed mutations; preflight and extraction errors still fail.                                          |
| `SEEDER_BATCH_SIZE`             | `50`                            | Positive integer batch size.                                                                                                                                                                      |
| `SEEDER_ENABLE_FULL_IDEMPOTENT` | `false`                         | Required for full-idempotent import, including with `--yes` or `--force`.                                                                                                                         |
| `SEEDER_JSON_ONLY`              | `false`                         | Disable system binary extraction/cleanup; manual `--assets` overrides it. Does not affect file import.                                                                                            |
| `SEEDER_AUTO_EXTRACT_SYSTEM`    | `false`                         | Enable automatic system extraction in development.                                                                                                                                                |
| `SEEDER_AUTO_EXTRACT_CORE`      | `false`                         | Independently enable automatic configured core extraction in development.                                                                                                                         |
| `SEEDER_AUTO_EXTRACT_INCLUDE`   | Unset                           | Optional nonempty list of supported system/configured core names. Overrides general filters and skips cleanup for auto-extract only.                                                              |
| `SEEDER_JSON_INDENT`            | `tab`                           | Exact `tab` or `space`, without trimming; manual and automatic extraction.                                                                                                                        |
| `SEEDER_JSON_INDENT_SIZE`       | `2`                             | Integer `1`–`10`; used with `space`, validated even with `tab`.                                                                                                                                   |
| `SEEDER_SEEDS_DIR`              | `/directus/seeds`               | Nonblank, trimmed seeds root; scope JSON/history lives under `system/` or `core/`.                                                                                                                |
| `SEEDER_ASSETS_DIR`             | `/directus/seeds/system/assets` | Nonblank, trimmed system asset path, independent of the seeds root. Changing the root never relocates assets.                                                                                     |
| `DEFAULT_EMAIL`                 | `admin@example.com`             | String replacing the email of matching root-user seeds.                                                                                                                                           |
| `DEFAULT_PASSWORD`              | `p4ssw0rd!`                     | String replacing matching root-user passwords. Supply a deployment-specific secret.                                                                                                               |
| `STORAGE_LOCATIONS`             | `['local']`                     | Directus storage locations: one nonblank string or a nonempty array, trimmed. File imports retain seeded `storage`, otherwise use the first location. Storage drivers must already be configured. |

Lists accept singular values or Directus-cast arrays and normalize to arrays. For example,
`SEEDER_INCLUDE=directus_roles,directus_users` selects two names, while
`SEEDER_INCLUDE=string:directus_roles,directus_users` is one literal entry: the hook does not split
strings itself. `SEEDER_INCLUDE=json:[]` selects all; `SEEDER_EXCLUDE=json:[]` excludes none. Blank
entries and nonstrings fail. The automatic allowlist is case-sensitive and rejects empty values,
empty arrays, and unknown names, even for a disabled scope. Omit it to use general filters.
`STORAGE_LOCATIONS=json:[]` is invalid.

Credential strings retain whitespace and explicitly empty values. In a standalone Directus `.env`,
use `string:` for numeric or boolean-like secrets, for example `DEFAULT_PASSWORD=string:123456`. If
deployment tooling already adds that prefix, supply the plain secret to that tooling.

Standard Directus `LOG_LEVEL=debug` or `trace` helps diagnose runs. CLI confirmations are also
skipped for non-TTY stdin/stdout or any nonempty raw process value of `CI`,
`CONTINUOUS_INTEGRATION`, `BUILD_NUMBER`, or `GITHUB_ACTIONS`, including the string `false`.

A minimal development setup:

```dotenv
DEPLOYMENT_ENV=development
SEEDER_SEEDS_DIR=/directus/seeds
SEEDER_ASSETS_DIR=/directus/seeds/system/assets
SEEDER_JSON_ONLY=true
SEEDER_AUTO_EXTRACT_SYSTEM=false
SEEDER_AUTO_EXTRACT_CORE=false
```

### Consumer JSON configuration

The package ships `seeder.config.example.json` and `seeder-config.schema.json`. Copy the example
outside managed output directories and set the runtime path:

```sh
cp node_modules/@onderwijsin/directus-seeder-hook/seeder.config.example.json ./seeder.config.json
```

```dotenv
SEEDER_CONFIG_PATH=./seeder.config.json
```

For example:

```json
{
  "$schema": "./node_modules/@onderwijsin/directus-seeder-hook/seeder-config.schema.json",
  "system": {
    "collections": {
      "directus_presets": { "management": { "type": "id-range", "max": 50000 } }
    }
  },
  "core": {
    "collections": {
      "categories": { "operationMode": "insert-update" },
      "articles": {
        "operationMode": "full-idempotent",
        "management": { "type": "manifest" },
        "fields": ["id", "title", "category"]
      }
    },
    "order": ["categories"]
  }
}
```

Mount the config separately in containers and use its container path. Copying it to the host alone
does not expose it to Directus. For editors without a local npm installation, copy the shipped
schema beside the config and use `"$schema": "./seeder-config.schema.json"`; keep it aligned with
the installed version. The schema is also exported as
`@onderwijsin/directus-seeder-hook/seeder-config.schema.json` for tooling. No TypeScript loader or
additional consumer dependency is required.

Top-level keys are optional string `$schema`/`$comment` metadata and optional `system`/`core`.
Metadata is ignored at runtime. `system` accepts optional `collections` and `order`; `{}` retains
all built-ins. `core` requires `collections` and accepts optional `order`. Unknown properties or
unsupported names fail validation, even for excluded collections.

| Collection property | Contract                                                                                                                                                           |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `operationMode`     | Exact `insert-missing`, `insert-update`, or `full-idempotent`. Optional system override; required for every core declaration, even with a CLI mode override.       |
| `fields`            | Array of field names, or `null` for all fields. Omitted: system projection below; core `['*']`. Explicit core arrays must include the actual primary key or `'*'`. |
| `filter`            | Directus extraction filter, or `null` to clear it. Does not constrain import deletes.                                                                              |
| `sort`              | Array of sort strings, or `null` to clear it.                                                                                                                      |
| `deep`              | Directus deep-query object, or `null` to clear it.                                                                                                                 |
| `management`        | ID range, direct relation, or manifest object described below. `null` removes a boundary; omission preserves the system default.                                   |

Overrides replace whole properties, without recursive merging. Include every desired field when
replacing `fields`; `["id", "name"]` drops other built-in fields. Replacing the presets filter also
removes its `user = null` rule unless you include it. Setting roles `management: null` keeps its
full-idempotent mode but makes synchronization whole-collection. Inspect defaults before overriding:

```sh
npx directus seed config --defaults --collection directus_roles
npx directus seed config --collection directus_roles
```

Each scope's `order` is a unique-name priority prefix, followed by remaining built-ins (system) or
JSON declarations (core). Unknown or duplicate names fail. System overrides/order do not select
collections or add new system collections. Core declarations define the available application
collections; names start with a letter or underscore, followed by letters, digits, or underscores.
The `directus_` prefix and `__proto__` are rejected. Core inherits no system defaults or
transformations. Consumers own schema, dependency order, and existing related records; file foreign
keys remain scalar references, with binaries managed separately through system functionality.

See [query parameters](https://directus.com/docs/guides/connect/query-parameters) and
[filter rules](https://directus.com/docs/guides/connect/filter-rules). Query shapes are validated
before cleanup, but Directus validates actual fields/relations during reads. Combine comparisons on
one field as separate objects in `_and`; multiple operators in a single predicate are rejected.

Configured missing, unreadable, malformed, or invalid files abort before import mutations or
extraction cleanup, without fallback. Imports, manual exports, and normal inspection reread the file
on each invocation; auto-extract captures it at hook registration and needs a restart to reload.

## Seed files and supported collections

Store one JSON array per collection under `<SEEDER_SEEDS_DIR>/<scope>/<collection>.json`:

```text
/directus/seeds/
├── system/
│   ├── directus_roles.json
│   ├── directus_roles.managed-ids.json
│   └── assets/
│       └── <filename_disk>
└── core/
    ├── categories.json
    ├── articles.json
    └── articles.managed-ids.json
```

Root-level JSON/history is ignored; there is no flat-layout fallback or migration. Assets use the
independent `SEEDER_ASSETS_DIR`. System seeds use stable `id` values and scalar foreign-key IDs:

```json
[{ "id": "2a7d5e56-ba21-4fe5-b18e-f0d7147c7ae0", "name": "Editor", "icon": "edit" }]
```

Built-in modes and management:

| Collections                                                                                                      | `operationMode`   | `management`                                                                   |
| ---------------------------------------------------------------------------------------------------------------- | ----------------- | ------------------------------------------------------------------------------ |
| `directus_policies`, `directus_roles`, `directus_users`, `directus_access`, `directus_folders`, `directus_files` | `full-idempotent` | `{ "type": "manifest" }`                                                       |
| `directus_presets`, `directus_settings`                                                                          | `insert-update`   | None                                                                           |
| `directus_permissions`                                                                                           | `full-idempotent` | `{ "type": "relation", "field": "policy", "collection": "directus_policies" }` |
| `directus_dashboards`, `directus_panels`, `directus_flows`, `directus_operations`, `directus_translations`       | `full-idempotent` | None                                                                           |

The following table also defines the built-in processing order and extraction defaults. Imported
JSON may contain additional Directus fields. Presets have no default ID cap; the configuration
example adds one for that consumer only.

| Collection, in processing order | Extracted fields and filter                                                                                                                                                                                               |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `directus_policies`             | `id`, `name`, `icon`, `description`, `ip_access`, `enforce_tfa`, `admin_access`, `app_access`                                                                                                                             |
| `directus_roles`                | `id`, `name`, `icon`, `description`, `parent`                                                                                                                                                                             |
| `directus_users`                | `id`, `avatar`, `first_name`, `last_name`, `title`, `description`, `email`, `status`, `provider`, `role`, `email_notifications`, `tags`, `language`                                                                       |
| `directus_access`               | `id`, `policy`, `role`, `sort`, `user`                                                                                                                                                                                    |
| `directus_presets`              | `id`, `bookmark`, `user`, `role`, `collection`, `search`, `layout`, `layout_query`, `layout_options`, `refresh_interval`, `filter`, `icon`, `color`; only `user = null`, without an ID cap, sorted by `-role`, then `id`. |
| `directus_permissions`          | `id`, `collection`, `action`, `permissions`, `validation`, `presets`, `fields`, `policy`                                                                                                                                  |
| `directus_folders`              | `id`, `name`, `parent`, `type`; sorted by `-parent`.                                                                                                                                                                      |
| `directus_files`                | `id`, `filename_disk`, `filename_download`, `description`, `title`, `type`, `folder`                                                                                                                                      |
| `directus_dashboards`           | `id`, `name`, `note`, `icon`, `color`                                                                                                                                                                                     |
| `directus_panels`               | `id`, `dashboard`, `name`, `icon`, `color`, `show_header`, `note`, `type`, `position_x`, `position_y`, `width`, `height`, `options`                                                                                       |
| `directus_flows`                | `id`, `name`, `icon`, `color`, `description`, `status`, `trigger`, `accountability`, `options`, `operation`, `folder`                                                                                                     |
| `directus_operations`           | `id`, `name`, `key`, `type`, `position_x`, `position_y`, `options`, `resolve`, `reject`, `flow`; ordered by operation references where possible, with warnings for cycles.                                                |
| `directus_settings`             | All fields except `license_key` and `license_token`.                                                                                                                                                                      |
| `directus_translations`         | `id`, `language`, `key`, `value`; sorted by `key`, then `language`.                                                                                                                                                       |

Other system collections, including `directus_extensions`, and schema are outside system scope.
Declare application collections under `core.collections`.

Extraction always omits `directus_users.password`, including with explicit `fields` overrides,
wildcards, or `fields: null`. Directus conceals existing passwords, so they cannot be recovered by
extraction. Output can still contain secrets in settings, Flow options, or custom fields; these
omissions are not general secret redaction. Review output before sharing or committing it. Seeder
output is not a complete database/storage backup.

### Primary keys and input preflight

Import requires the selected scope directory to exist and be a directory; flat root files do not
satisfy this requirement. Extraction creates selected scope directories. An existing scope directory
with no selected seed files is a successful no-op with a warning and no database work or cache
clearing. Only supported direct child seed files count; nested/unsupported files are ignored.

Selection happens before preflight. Before any selected collection is mutated, required input and
transformations are validated, including Flow filter metadata, relation sources, and manifests where
applicable. Invalid required input aborts the entire import even with continuation enabled.
Unselected files are ignored unless needed as Flow metadata or a relation source.

- A missing target file (ENOENT only) skips its collection in every mode, including deletes.
- Valid `[]` is intentional empty data: insert modes do nothing; full-idempotent deletes within
  management, or the whole selected collection without a boundary.
- Invalid JSON, a non-array root, empty/whitespace-only files, and other read errors exit 1 with
  file context. Missing data is never silently converted to `[]`.

Core resolves the actual live schema primary key, including names other than `id`. Every imported
row requires a unique schema-compatible key: canonical lowercase UUID, nonempty string, safe
`integer` number, or canonical decimal `bigInteger` string, without coercion. Big-integer keys
retain their string representation, including small IDs such as `"2"` and values beyond JavaScript's
safe integer range such as `"9007199254740993"`. Decimal strings allow `0` or an optional minus sign
followed by digits without leading zeroes; numbers, `+2`, `02`, `-0`, whitespace, fractions, and
exponents are rejected for big-integer keys. PostgreSQL roundtrips are verified; other databases
require Directus and its driver to return bigint strings as well. Missing/duplicate/invalid keys,
missing collections, alias or missing keys, and unsupported key types fail before mutations in every
mode, including full reset. Explicit extraction `fields` must contain that key or `'*'`; `[]` fails.
Omitted/null fields use `['*']`. The Seeder never inserts a key into an explicit projection.

**Integer primary key `0`**

The Seeder currently does not support records with an integer primary key of `0` due to limitations
in Directus' `ItemsService`. This is intentionally not worked around by the Seeder.

For further context and Directus' rationale for not addressing this edge case, see
[issue #28318](https://github.com/directus/directus/issues/28318) and
[PR #28319](https://github.com/directus/directus/pull/28319).

### System transformations and compatibility

For ordinary users, explicit seed `password` values are passed to Directus when creating or updating
records according to the selected mode. Use an explicit password for local development users that
need to log in immediately. Omitting `password` leaves an existing user's password unchanged;
`insert-missing` never updates existing users. Any supplied `password` consisting solely of one or
more asterisks (`*`, `**`, etc.) is rejected during input preflight, before any selected collection
mutates, even with `SEEDER_CONTINUE_ON_ERROR=true`. This validation also applies to root-user seed
input before the environment overrides below.

Matching root-user seeds always receive `DEFAULT_EMAIL` and `DEFAULT_PASSWORD`, including when the
JSON omits `password`: this existing transformation supplies an effective seed password. Their
status is `active` only in exact `development`, otherwise `suspended`. Matching is case-insensitive:
title exactly `super user`, or first name `admin` and last name `developer` or `user`. This is not a
permission check and does not create a missing seed user. Update modes overwrite the matching target
values.

Explicit policy `enforce_tfa: true` remains true. Exact `production` additionally enforces TFA for
policies with `admin_access: true` or `app_access: true`; otherwise enforcement is false.

Outside exact `development`, flows with `[dev]` in their name (case-insensitive) and their seeded
operations are filtered out. Operations read an existing `directus_flows.json` as filter metadata
even when Flows are unselected; invalid metadata aborts preflight, a missing file supplies no IDs,
and reading it does not import it. In development an unselected Flow file is ignored.

Operations are supplied as reference-free rows followed by reference updates in the same collection
input. Reference restoration can be skipped in insert-missing or fail during import: this is not a
guaranteed transactional two-pass import. Verify Flow links afterward. Extraction orders operations
by references where possible and warns about cycles.

When the target lacks `directus_folders.type` or `directus_flows.folder`, extraction omits only
those absent fields from inherited default projections. Explicit `fields` arrays pass unchanged;
selecting missing fields still fails. Other overrides retain this adaptation. Import preflight
removes only `type: "files"` and `folder: null` for older schemas; other supplied values fail with
file/row/field context before any mutation. With those fields present, values are retained; omitted
fields follow normal Directus create/update semantics.

## Seeding safety and management

| Mode              | Effect                                                                                                |
| ----------------- | ----------------------------------------------------------------------------------------------------- |
| `insert-missing`  | Create records whose primary keys do not exist.                                                       |
| `insert-update`   | Create missing records and update existing records.                                                   |
| `full-idempotent` | Also delete target records absent from seeds, within management or the whole collection if unbounded. |

Effective mode precedence is explicit CLI `--mode`, then each collection's configured/built-in
`operationMode`. Only selected collections with present seed files participate in safety prompts and
the destructive gate. Full-idempotent requires `SEEDER_ENABLE_FULL_IDEMPOTENT=true`; interactive
runs require exact `DELETE`. Otherwise insert-update prompts yes/no, default no. Prompt bypasses are
listed above; cancellation exits 0. Back up and review the target before destructive import.

```sh
SEEDER_ENABLE_FULL_IDEMPOTENT=true npx directus seed system --include directus_roles --yes
```

Stable keys are necessary for repeatability. Core always requires them; unbounded system import
retains batch-dependent handling of ID-less rows, unsuitable for synchronization.

Management applies only to full-idempotent import; insert modes do not read sources/manifests, and
CLI mode overrides preserve configured boundaries. Preflight validates all required boundaries
before any selected collection mutates. **Extraction filters and omitted fields do not protect
managed records from deletion.** A filtered export or environment transformation can omit records
that full-idempotent later deletes.

### ID-range management

```json
{ "management": { "type": "id-range", "min": 1, "max": 50000 } }
```

`min` is inclusive, `max` exclusive; at least one is required and `min < max` when both are present.
Bounds must be safe-integer numbers; unknown properties/types, null, fractional, unsafe, or empty
bounds fail configuration validation regardless of mode. Bounded full-idempotent seed IDs must be
explicit safe integer numbers or canonical decimal bigint strings within the range. Comparisons are
exact even for bigint IDs outside JavaScript's safe integer range; bounds remain safe-integer
numbers. Core range extraction/import also requires an integer or big-integer schema primary key.

Full-idempotent preserves out-of-range rows; `[]` deletes only in-range rows. Extraction ANDs the
range with its query filter, but deletion uses only the range. For example, the presets
`user = null` filter can omit personal presets inside the range without protecting them from later
deletion.

### Manifest management

```json
{ "management": { "type": "manifest" } }
```

History lives beside seeds at `<seeds-root>/<scope>/<collection>.managed-ids.json`, as a plain ID
array. Extraction queries current data independently of existing seeds/history and unions exported
IDs into that manifest, deduplicated and sorted lexically for strings or numerically for numbers.
IDs must match the live primary-key type: lowercase UUID, nonempty string, safe integer number, or
canonical decimal bigint string. Bigint IDs remain strings in history; other string keys retain
case. Include the primary key in extracted fields.

A missing manifest is created on extraction. Empty exports write ordinary seed `[]` while keeping
history. Only extracted collections update history. Invalid/unreadable existing manifests fail and
are never overwritten; replacement is atomic, but the whole export has no rollback. Cleanup
preserves all `*.managed-ids.json` files.

Full-idempotent import requires every seed ID to belong to a valid manifest and leaves it unchanged.
Missing, unreadable, invalid history or out-of-set/missing seed IDs abort preflight. A missing
target seed file skips its manifest. Empty history plus empty seeds does no collection
reads/mutations; nonempty seeds against empty history fail. Empty seeds with history delete only
historical IDs.

For history A/B, seeds A, and target A/B/C, import synchronizes A, deletes B, and preserves C.
Narrowing an export can leave historical IDs absent from seeds but still eligible for deletion. To
relinquish management, review remaining target rows and remove those IDs from history and seeds; a
later export of them adds them again. Manifests contain IDs only, without timestamps or statuses.

### Relation management

```json
{
  "management": { "type": "relation", "field": "policy", "collection": "directus_policies" }
}
```

One direct scalar many-to-one foreign key defines membership through the raw source file
`<seeds-root>/<scope>/<source-collection>.json`. The example manages permissions linked to policy
IDs in `system/directus_policies.json`, even when Policies are not selected for import. System
sources must be supported system collections; core sources need not be separately declared or
selected. The relation must target the source's actual schema primary key with compatible scalar
types. Paths, aliases, compound relationships, and nested relation objects are unsupported.

Required sources must be readable valid arrays with explicit unique schema-compatible keys. Source
filters, management, and transformations do not narrow raw membership; management is not recursive.
Target rows need explicit primary keys and a non-null scalar foreign key belonging to that set.
Lowercase UUIDs, exact nonempty string keys, safe integer numbers, and canonical decimal bigint
strings are validated. For mixed integer/bigInteger relations, source membership is represented in
the foreign key's type: a bigint FK uses strings, an integer FK uses safe numbers. Seed payloads
retain their values; unrepresentable source IDs fail preflight. An existing target seed-ID collision
outside membership aborts instead of moving that row into it.

A missing/invalid source fails preflight rather than implying an empty/unbounded set. Source `[]`
with target `[]` does no target reads/mutations; nonempty target seeds fail. Target `[]` with a
nonempty source deletes only rows currently linked to its IDs. Missing target files skip work.

With the policy already present in Directus and its ID in `system/directus_policies.json`, clear its
permissions by writing `[]` to `system/directus_permissions.json` and running:

```sh
SEEDER_ENABLE_FULL_IDEMPOTENT=true npx directus seed system --include directus_permissions --yes
```

Relation management keeps no ownership history. To relinquish a source ID, retain it while importing
target `[]`, verify the clear, then remove it. Review parent deletion/database cascades separately.
Extraction does not read relation-source seeds or inherit their queries; configure each collection's
query explicitly and review exported target membership before importing.

### Full reset

```sh
SEEDER_ENABLE_FULL_IDEMPOTENT=true npx directus seed system --mode full-idempotent --full-reset --include directus_roles --yes
```

`--full-reset` bypasses all management boundaries for this import and reads no management sources or
manifests. Every selected collection with a seed file must resolve to full-idempotent. Selection,
other input preflight, environment opt-in, and prompts still apply. Empty seeds clear the entire
selected collection, including unmanaged records; missing files still skip it. Configuration/history
remain unchanged. This synchronizes records; it does not reset schema or reinsert every record.

### Failure handling

There is no extension-wide transaction or rollback. Preflight checks required inputs,
transformations, and managed IDs, not complete record schemas or binary availability. Database/asset
failures can leave earlier mutations or uploads intact. Every mutation failure exits 1. By default
it stops at the failed collection; continuation skips the rest of that collection and attempts later
ones, still exiting 1. Counts can omit partial progress in a failed batch.

After collection processing, imports attempt to clear the Directus system cache even after partial
failure. Cache failure also exits 1 and may leave stale state. Fix the cause, inspect target data,
and rerun deliberately. Fully successful runs and valid no-ops exit 0.

## Extraction, assets, and automatic behavior

Extraction reads current Directus data using each collection's query, without existing seed files.
ID ranges additionally filter exports; relation management is import-only, and manifests retain
exported-ID history without filtering the query. Selected files are overwritten even for empty
results (`[]` plus one newline), including with `--skip-clean` or selective auto-extract.

JSON uses tabs by default, or `SEEDER_JSON_INDENT=space` with width `1`–`10`, and exactly one final
newline. The same input produces the same serialization. No project formatter is invoked.

### Cleanup and output paths

Manual extraction cleans first unless `--skip-clean`. Automatic extraction cleans only
event-triggered scopes when its allowlist is unset; an explicit allowlist skips cleanup.

- Each participating scope loses direct regular `.json` files except `*.managed-ids.json`, including
  unselected seed JSON. Non-JSON files, nested directories, and symlinks remain.
- With system binaries enabled, the assets directory loses **all direct regular files**, even for an
  empty `directus_files` collection.
- Cleanup never recurses, follows symlinks, clears the seeds root as a whole, or touches an
  unselected scope. Include/exclude does not narrow cleanup.

Use dedicated output directories: hand-created and uncommitted matching files are deleted too. Keep
configuration/schema files outside them. Before deletion, extraction rejects filesystem roots,
symlinked directories/ancestors, and assets equal to or containing the effective JSON directory,
even in JSON-only mode. System binary extraction also rejects assets equal to or containing the core
directory. Assets may be nested within system output or live separately.

Read errors fail instead of writing empty results. Cleanup or previous writes may already have
happened; extraction has no whole-run rollback. Inspect partial JSON/manifests/assets, fix the
cause, and rerun with the intended cleanup policy before using the export.

### Assets

Core never reads, downloads, or cleans binaries. System JSON-only mode also preserves every binary
while still exporting `directus_files.json` when selected. Manual `--assets` overrides environment
JSON-only; it cannot be combined with `--json-only`.

Binary export queries **all** `directus_files`, regardless of JSON selection, fields, filters, or
management. It buffers each asset in memory and writes it under `filename_disk`. Download failures
fail the run. File import reads those local binaries and uploads through Directus `FilesService`,
preserving supplied IDs; updates re-upload too. Missing binaries/`filename_disk` cause errors.
JSON-only controls extraction only; the hook does not provision storage.

```sh
# Clean system JSON and export all binaries (default)
DEPLOYMENT_ENV=development npx directus seed extract
# Refresh selected JSON while preserving other output and every binary
DEPLOYMENT_ENV=development npx directus seed extract --json-only --skip-clean --include directus_roles
# Clean/export core only; leave system JSON and assets untouched
DEPLOYMENT_ENV=development npx directus seed extract --scope core
```

### Automatic extraction

Require exact `DEPLOYMENT_ENV=development` and enable `SEEDER_AUTO_EXTRACT_SYSTEM`,
`SEEDER_AUTO_EXTRACT_CORE`, or both. Core needs configured collections. Selected CRUD actions share
a 15-second debounce; further events extend it. Changed scopes run sequentially under the shared
bulk lock, each refreshing all its selected collections in configured order. Core-only events leave
system JSON/assets untouched. Enabling auto-extract does not extract or import at startup.

Automatic failures are logged per scope; other changed scopes are still attempted. There is no
automatic retry. Inspect partial output, fix the cause, and trigger a new event or extract manually.

System events use names such as `roles.create/update/delete`; core uses
`<collection>.items.create/update/delete`. See
[Directus event hooks](https://directus.com/docs/guides/extensions/api-extensions/hooks).
`users.update` with only `last_page` or an empty payload is ignored. File uploads may not emit
monitored events; use manual extraction when needed.

| Selection                         | Triggers and output                                                                                                                                        | Cleanup and binaries                                                                                                                                      |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Allowlist unset                   | General include/exclude in enabled scopes; only changed scopes run.                                                                                        | Clean changed scope JSON; system honors `SEEDER_JSON_ONLY` and can export/clean all assets.                                                               |
| `SEEDER_AUTO_EXTRACT_INCLUDE` set | Only listed supported system/configured core names in enabled scopes; overrides both general filters. Each changed scope refreshes its listed collections. | No cleanup. System is forced JSON-only unless `directus_files` is listed; even then binaries require `SEEDER_JSON_ONLY=false` and still export all files. |

For example, with `articles` declared:

```dotenv
DEPLOYMENT_ENV=development
SEEDER_AUTO_EXTRACT_SYSTEM=true
SEEDER_AUTO_EXTRACT_CORE=true
SEEDER_AUTO_EXTRACT_INCLUDE=directus_roles,articles
```

Both switches default to false. Omit the allowlist for general filters; blank/empty/unknown names
fail, including for disabled scopes. Manual commands ignore the automatic allowlist. Selective runs
retain stale JSON/binaries from previous selections, removed records, or renamed files. Review them
before import; use a deliberate clean manual export for a fresh snapshot. Debouncing is not
incremental extraction: repeated system changes can re-export large binaries with substantial I/O.

### Coordination and troubleshooting

Commands and auto-extract share `directus-lock-bulk-operation.flag` in the process temporary
directory. Active contention fails manual commands before work; automatic work skips without retry.
Flags expire after five minutes without renewal. Cleanup releases only the acquired owner's flag,
including process-exit cleanup on prompt cancellation.

This is local filesystem coordination, not a distributed lock or overlap guarantee: expiration and
non-atomic checks/removal can allow overlap, and separate temporary filesystems do not coordinate.
Run commands sequentially and stop extraction writers during deployment seeding. After interruption,
inspect active operations before removing stale flags or retrying; partial data/output may remain.

For missing commands, check installation, loading, and `SEEDER_ENABLED`; missing extraction also
requires exact development. For auto-extract, check scope switches, selection, debounce, and bulk
flags. For failed runs, inspect exit status, Directus logs (`debug`/`trace`), directory permissions,
required inputs/assets, and storage configuration before accepting or retrying results.

### Consumer formatting

If project formatting is needed, wrap manual extraction and your installed formatter in a project
script, for example with Oxfmt:

```json
{
  "scripts": {
    "seed:extract": "DEPLOYMENT_ENV=development SEEDER_SEEDS_DIR=./seeds SEEDER_ASSETS_DIR=./seeds/system/assets directus seed extract && oxfmt 'seeds/system/*.json'"
  }
}
```

The consumer owns formatter dependencies/configuration and environment syntax. `&&` runs formatting
only after extraction succeeds and propagates formatter errors. For containers, bind-mount output
and run formatting where its tooling is installed. Auto-extract does not invoke this script.

## License

MIT. See `LICENSE` in the installed package.
