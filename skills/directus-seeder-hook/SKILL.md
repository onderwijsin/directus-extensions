---
name: directus-seeder-hook
description: Install, configure, inspect, seed, extract, and troubleshoot Directus system records.
---

# Directus seeder hook

Use `@onderwijsin/directus-seeder-hook` for JSON-based Directus system-record seeding and optional
development extraction.

## Choose and verify the operation

1. Confirm Directus/Node compatibility, trusted extension loading, and runtime dependencies. For
   import or extraction, also verify access to the configured database, storage, seed, asset, and
   temporary paths. Complete when the installed CLI lists `seed config` and `seed system`;
   extraction also requires exact `DEPLOYMENT_ENV=development`. If using `SEEDER_CONFIG_PATH`,
   verify the JSON file is readable in that runtime and outside extraction output, then review its
   strict collection overrides, order, and management ranges.
2. Before customizing collection properties, inspect `seed config --defaults --collection <name>`
   and compare it with `seed config --collection <name>`. Complete when the JSON confirms the
   intended resolved mode and every retained field, query property, and management range. A supplied
   `fields` array replaces the whole built-in projection; include every field you want to retain.
   `--defaults` skips the consumer file and global mode; normal inspection reports invalid files.
3. For extraction, verify dedicated output paths, default cleanup, and JSON-only or binary behavior
   below. Use `--skip-clean` only for a manual run that must retain other output. Complete when
   every selected JSON file exists (including `[]` for empty collections), expected binaries exist,
   and logs report no failures. After a read error or interruption, fix the cause and rerun to
   recover output.
4. For seeding, resolve include/exclude and review selected files plus any required Flow metadata,
   IDs, environment transformations, and target backup. Resolve every selected effective mode:
   explicit CLI `--mode`, then collection `operationMode`, then `SEEDER_MODE`/`insert-missing`.
   Review the strongest safety requirement across that selection and any full-idempotent ranges;
   extraction filters never protect omitted in-range records from deletion. Complete when exit code
   zero, logs, and target records confirm the expected result.
5. After seeding, inspect Flow operation links, policy TFA, matching root-user status/credentials,
   and uploaded assets where selected. Complete when those results match the intended environment.

The reference below covers the complete consumer contract, including optional JSON overrides for
existing system collections. Use include/exclude for selection; configuration entries and order do
not select collections.

Seed Directus system records from JSON, extract their current state, and optionally extract changes
automatically during development. Use `seed system` to import records and `seed extract` to export
them. Use `seed config` to inspect collection configuration without importing or extracting data.

## Install

Install in the Directus project:

```sh
pnpm add @onderwijsin/directus-seeder-hook
```

Requires Directus `>=12.0.0 <13.0.0`, Node.js `>=24.10.0`, and a trusted, non-sandboxed Directus
installation with database, storage, and filesystem access. Restart Directus after installation. See
[including extensions](https://directus.com/docs/self-hosting/including-extensions) for deployment
loading. Installations allowing only sandboxed extensions cannot load this hook.

The Directus process must be able to read seed JSON and assets, write extraction output and
temporary files, and access configured Directus storage. Mount persistent paths yourself in
containers. The hook uses Directus services with administrator permissions rather than a caller's
API token.

## Commands and options

```sh
npx directus seed system --mode insert-missing
npx directus seed system --mode insert-update --include directus_roles directus_permissions --yes
DEPLOYMENT_ENV=development npx directus seed extract
```

In hardened Directus images without `npx`, invoke the installed CLI directly, for example:

```sh
docker compose exec directus node /directus/cli.js seed system --mode insert-missing
docker compose exec -e DEPLOYMENT_ENV=development directus node /directus/cli.js seed extract
```

| Option                           | `seed system`                                                                                                                                                           | `seed extract`                                                                                         |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `-m, --mode <mode>`              | `insert-missing`, `insert-update`, or `full-idempotent` (case-sensitive). Overrides every collection mode; omitted: use collection `operationMode`, then `SEEDER_MODE`. | —                                                                                                      |
| `-i, --include <collections...>` | Select supported collections.                                                                                                                                           | Select collections whose JSON is extracted.                                                            |
| `-e, --exclude <collections...>` | Exclude collections after inclusion.                                                                                                                                    | Exclude collections after inclusion.                                                                   |
| `-f, --force`                    | Skip confirmation prompts.                                                                                                                                              | —                                                                                                      |
| `-y, --yes`                      | Alias for `--force`.                                                                                                                                                    | —                                                                                                      |
| `--skip-clean`                   | —                                                                                                                                                                       | Skip the default output cleanup for this manual invocation; selected JSON files are still overwritten. |
| `-a, --assets`                   | —                                                                                                                                                                       | Enable binary extraction even with `SEEDER_JSON_ONLY=true`. Mutually exclusive with `--json-only`.     |
| `--json-only`                    | —                                                                                                                                                                       | Extract JSON without reading, downloading, or deleting binaries. Mutually exclusive with `--assets`.   |
| `-h, --help`                     | Show command help.                                                                                                                                                      | Show command help.                                                                                     |

CLI collection names are separate space-delimited arguments, not comma-separated tokens. CLI lists
override their respective environment lists; exclusions always win. During extraction,
include/exclude selects JSON output only: it never narrows cleanup or binary asset extraction.
Selection retains the configured processing order and supports only the built-in collections. Import
and extraction accept no positional seed path; configure directories through the environment.
Extraction cleans output and writes JSON plus binaries by default. `--skip-clean` is manual-only;
there is no environment setting to skip cleanup.

`seed system` does not run automatically at server startup. Run it explicitly after database
bootstrap/schema setup. It clears the Directus system cache after seeding, except when no selected
seed files exist. Import and extraction release their own bulk-operation flag and call
`process.exit()` in their final cleanup.

### Inspect collection configuration

With the hook enabled, configuration inspection is available in every deployment environment:

```sh
# Effective collection configuration: built-ins plus consumer overrides and resolved modes
npx directus seed config
# Built-in collection configuration and the built-in global mode
npx directus seed config --defaults
# Effective configuration for one supported collection
npx directus seed config --collection directus_roles
# Built-in configuration for one supported collection
npx directus seed config --defaults --collection directus_roles
```

Built-ins are the package's collection settings. Consumer overrides are the optional JSON file's
explicit properties. Effective configuration merges those properties with built-ins and resolves
each collection's `operationMode`: its JSON override, then `SEEDER_MODE`, then the built-in global
default `insert-missing`. Every output collection includes its resolved mode. `--defaults` skips
`SEEDER_CONFIG_PATH` and its file entirely, even if the file is missing or invalid, and ignores
`SEEDER_MODE` in favor of the built-in global default `insert-missing`. Startup environment
validation still applies.

Output is JSON with two-space indentation and one final newline, independently of extraction's
`SEEDER_JSON_INDENT` settings. The command itself writes only configuration JSON to stdout and
errors to stderr. Directus startup may also log to stdout; use `LOG_LEVEL=silent` when piping the
JSON, for example with `jq`:

```sh
LOG_LEVEL=silent npx directus seed config | jq '.system.order'
```

For example, built-in roles inspection has this structure:

```json
{
  "system": {
    "order": ["directus_roles"],
    "collections": {
      "directus_roles": {
        "operationMode": "insert-missing",
        "filter": null,
        "fields": ["id", "name", "icon", "description", "parent"]
      }
    }
  }
}
```

`system.order` contains the full resolved order, including built-ins appended after any consumer
priority prefix. Inspection lists all supported collections regardless of `SEEDER_INCLUDE` or
`SEEDER_EXCLUDE`; those settings select import and extraction collections. `--collection` filters
both `order` and `collections` to exactly one supported collection. An unknown collection produces a
clear error and exit code 1. `seed config` accepts no `--mode`, `--include`, or `--exclude` options.

Normal inspection loads and validates the configured JSON file; a missing, unreadable, malformed, or
invalid file produces an error and exit code 1 without falling back to defaults. Inspection does not
read seeds, initialize services, access the database or schema, clear caches, acquire locks, write
files, or run extraction. It requires no destructive-seeding opt-in or confirmation, even when the
inspected effective mode is `full-idempotent`.

## Configuration reference

Directus casts environment `true`/`false` to booleans, numeric values to numbers, and
comma-separated lists to arrays before passing them to the hook. See
[Directus configuration](https://directus.com/docs/configuration/intro). The hook validates
environment configuration once at startup and reuses that validated snapshot for commands, automatic
extraction, import transformations, and file imports. Invalid environment values fail startup before
registration, even for unused options or when a CLI option would override them. Missing values use
the defaults below. `SEEDER_ENABLED=false` skips registration and remaining validation.

Seeder boolean options require booleans after Directus casting; numbers `0`/`1` and strings that
remain strings are rejected. Integer options require numbers of the documented range, without string
coercion or truncation. Use Directus's `string:` prefix when a string would otherwise be cast to
another type. Credential strings retain whitespace and explicitly empty strings.

| Variable                        | Default                          | Behavior and accepted values                                                                                                                                                                                                                                                                                                                             |
| ------------------------------- | -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SEEDER_ENABLED`                | `true`                           | Boolean master switch. Boolean `false` or string `false` disables all command and automatic-hook registration and skips remaining configuration validation.                                                                                                                                                                                              |
| `DEPLOYMENT_ENV`                | Unset                            | Optional, untrimmed free string, including names such as `staging`. Only exact `development` registers manual and automatic extraction. Exact `production` adds policy TFA enforcement. Every other value, including unset, suspends matching root users and filters development flows during seeding.                                                   |
| `SEEDER_MODE`                   | `insert-missing`                 | String: `insert-missing`, `insert-update`, or `full-idempotent`, case-insensitive without trimming. Unsupported values fail. Fallback when neither CLI `--mode` nor collection `operationMode` is set; an explicit CLI mode is case-sensitive.                                                                                                           |
| `SEEDER_CONFIG_PATH`            | Unset                            | Optional nonblank string path to the consumer JSON configuration below. Relative paths resolve from the Directus runtime working directory. An explicitly configured missing, unreadable, malformed, or invalid file fails before database mutations or extraction cleanup.                                                                              |
| `SEEDER_SCOPE`                  | `system`                         | String: only `system`, case-insensitive without trimming. Unsupported values fail. No custom scope is provided.                                                                                                                                                                                                                                          |
| `SEEDER_INCLUDE`                | `[]` (all supported collections) | Singular nonblank string or array of nonblank strings, trimmed and normalized to an array. An empty array includes all. CLI `--include` overrides it.                                                                                                                                                                                                    |
| `SEEDER_EXCLUDE`                | `[]` (none)                      | Same accepted list forms and normalization as inclusion. An empty array excludes none; exclusions win. CLI `--exclude` overrides it.                                                                                                                                                                                                                     |
| `SEEDER_CONTINUE_ON_ERROR`      | `false`                          | Boolean. `false` stops seeding on the first failed collection; `true` continues with the next collections. Any database or asset mutation failure exits 1 in either case. Required seed-input preflight and extraction read errors always fail the run.                                                                                                  |
| `SEEDER_BATCH_SIZE`             | `50`                             | Positive integer number. Zero, negative, fractional, nonnumeric, and uncast string values fail.                                                                                                                                                                                                                                                          |
| `SEEDER_ENABLE_FULL_IDEMPOTENT` | `false`                          | Boolean. Required before `full-idempotent` can delete records. `--force`/`--yes` does not bypass this gate.                                                                                                                                                                                                                                              |
| `SEEDER_JSON_ONLY`              | `false`                          | Boolean. Default `false` extracts JSON plus binaries. `true` disables binary reads, downloads, and cleanup for manual and automatic extraction. Manual `--assets` overrides `true`; `--json-only` forces JSON-only output. `directus_files.json` remains normal selected JSON.                                                                           |
| `SEEDER_AUTO_EXTRACT`           | `false`                          | Boolean. Enable monitored system-record changes to schedule extraction; also requires exact `DEPLOYMENT_ENV=development`.                                                                                                                                                                                                                                |
| `SEEDER_JSON_INDENT`            | `tab`                            | String: exact `tab` or `space`, without trimming. Controls manual and automatic JSON extraction. Unsupported values fail.                                                                                                                                                                                                                                |
| `SEEDER_JSON_INDENT_SIZE`       | `2`                              | Integer number from `1` through `10`. Applies only with `SEEDER_JSON_INDENT=space`, but is always validated, including when indentation is `tab`.                                                                                                                                                                                                        |
| `SEEDER_SEEDS_DIR`              | `/directus/seeds`                | Nonblank string, trimmed. Only missing values use the default; provided blank or nonstring values fail.                                                                                                                                                                                                                                                  |
| `SEEDER_ASSETS_DIR`             | `/directus/seeds/assets`         | Same path validation. Independent of the seeds directory: changing that directory does not relocate this default. Supports a nested or separate asset directory; see output-path safety below.                                                                                                                                                           |
| `DEFAULT_EMAIL`                 | `admin@example.com`              | String. Replaces the email of matching root-user seed records. An explicitly empty string is retained.                                                                                                                                                                                                                                                   |
| `DEFAULT_PASSWORD`              | `p4ssw0rd!`                      | String. Replaces the password of matching root-user seed records. An explicitly empty string is retained. Supply a deployment-specific secret. For standalone Directus, numeric or boolean-like passwords require the `string:` prefix; shared Compose adds that prefix itself, so its root `.env` must contain the plain value. See the examples below. |
| `STORAGE_LOCATIONS`             | `['local']`                      | Existing Directus storage configuration: singular nonblank string or nonempty array of nonblank strings, trimmed and normalized to an array. File imports retain supplied seed `storage`; otherwise they use the first validated location, including when Directus supplies an array. The hook does not configure storage drivers.                       |

The hook does not comma-split a string that remains a string after Directus casting. For example,
`SEEDER_INCLUDE=directus_roles,directus_users` arrives as an array of two names, while
`SEEDER_INCLUDE=string:directus_roles,directus_users` is one literal list entry. Blank entries or
nonstrings fail validation. `SEEDER_INCLUDE=json:[]` selects all supported collections;
`SEEDER_EXCLUDE=json:[]` excludes none. `STORAGE_LOCATIONS=json:[]` is invalid.

These controls remain outside the hook's configuration schema:

| Variable                                                         | Default          | Behavior                                                                                                                                      |
| ---------------------------------------------------------------- | ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `LOG_LEVEL`                                                      | Directus default | Standard Directus logging setting; use `debug` or `trace` for diagnostics.                                                                    |
| `CI`, `CONTINUOUS_INTEGRATION`, `BUILD_NUMBER`, `GITHUB_ACTIONS` | Unset            | Any nonempty raw process-environment value skips CLI confirmations, including the string `false`. Non-TTY stdin or stdout also skips prompts. |

### Configuration changes and migration

Configuration now rejects invalid representations instead of permissive boolean/integer parsing or
silent mode, scope, and path fallbacks. An omitted CLI `--mode` honors `SEEDER_MODE`, and file
imports without seed `storage` use the first configured location rather than falling back to `local`
for Directus-cast arrays. Configure seed paths with `SEEDER_SEEDS_DIR`. Extraction now cleans by
default; use manual `--skip-clean` to retain unselected output. `SEEDER_JSON_ONLY=false` includes
binaries by default; set it to `true` to disable binary handling. The retained seed-import data
handling and safety caveats below still apply.

Replace old `SEEDER_JSON_INDENT=2` or `SEEDER_JSON_INDENT=4` with `space` and the matching size. For
four spaces:

```dotenv
SEEDER_JSON_INDENT=space
SEEDER_JSON_INDENT_SIZE=4
```

The old numeric indentation values are rejected. Omitting both settings keeps tabs; choosing `space`
without a size uses two spaces. Invalid configuration is logged and startup fails with
`Invalid extension options ☝. Exiting.`.

Example development configuration:

```dotenv
SEEDER_ENABLED=true
DEPLOYMENT_ENV=development
SEEDER_SEEDS_DIR=/directus/seeds
SEEDER_ASSETS_DIR=/directus/seeds/assets
SEEDER_JSON_ONLY=false
SEEDER_AUTO_EXTRACT=false
SEEDER_JSON_INDENT=tab
SEEDER_ENABLE_FULL_IDEMPOTENT=false
```

Opt in to automatic extraction with `SEEDER_AUTO_EXTRACT=true`; leave it `false` for manual-only
extraction. Disable the entire hook with `SEEDER_ENABLED=false` and restart Directus. Consumer
collection overrides use JSON as described below. The hook provides no TypeScript loader or
data-provider API, HTTP endpoint, Studio UI, or Flow operation.

### Consumer JSON configuration

Set `SEEDER_CONFIG_PATH` to customize existing system collections. When it is unset, the hook uses
its built-in collection defaults. There is no automatic configuration-file discovery. A configured
file must be readable by the Directus process; a missing or unreadable file, invalid JSON, or
invalid configuration fails normal inspection and aborts before database mutations or extraction
output cleanup. `seed config --defaults` skips this file entirely. Validation applies even when an
invalid collection override would be excluded from the command. The effective configuration,
including built-in defaults, is structurally validated before operations. Load and validation errors
never silently fall back to defaults.

The JSON file is read when runtime configuration is resolved: each import, extraction, or normal
inspection invocation reads it again, while automatic extraction captures the effective
configuration when its hooks register. Restart Directus to reload JSON changes for automatic
extraction. Environment options remain the validated startup snapshot described above.

The published package includes `seeder.config.example.json` and `seeder-config.schema.json`. Copy
the example into your Directus project, outside the seed and asset output directories, then set
`$schema` to your installed package as shown below:

```sh
cp node_modules/@onderwijsin/directus-seeder-hook/seeder.config.example.json ./seeder.config.json
```

For example, use this `seeder.config.json`:

```json
{
  "$schema": "./node_modules/@onderwijsin/directus-seeder-hook/seeder-config.schema.json",
  "$comment": "Overrides replace whole properties; inspect built-in defaults before replacing fields.",
  "system": {
    "collections": {
      "directus_presets": {
        "management": { "type": "id-range", "max": 50000 }
      }
    },
    "order": ["directus_policies", "directus_roles"]
  }
}
```

Configure the path in the Directus environment:

```dotenv
SEEDER_CONFIG_PATH=./seeder.config.json
```

Relative paths resolve from the Directus runtime's current working directory, rather than the
extension's installation directory or your host shell's directory. In a container, mount the JSON
file separately, for example at `/directus/seeder.config.json`, and set that runtime path. Copying
the file to a host checkout alone does not make it readable inside Directus. Keep the config and
schema outside both managed output directories: normal cleanup deletes direct JSON files in the
seeds directory and, when binary extraction is enabled, all direct regular files in the assets
directory. Configuration files receive no cleanup exception.

For a local npm installation, prefer the `$schema` path above, adjusted to the package's actual
installed location relative to your config file. It uses the schema shipped with that installed
version. For Docker or Marketplace installations without a local npm package for your editor, copy
the shipped `seeder-config.schema.json` alongside the config and use
`"$schema": "./seeder-config.schema.json"`. Keep that copy aligned with the installed extension. The
JSON Schema is also exported as `@onderwijsin/directus-seeder-hook/seeder-config.schema.json` for
tooling. Configuration requires no TypeScript loader or additional consumer dependencies.

The top-level object accepts only optional string `$schema` and `$comment` metadata and optional
`system`. `$schema` supports editor tooling; `$comment` holds explanatory text. Both are ignored
when processing collection configuration; runtime validation uses the hook's schema. The `system`
object accepts only `collections` and `order`; `{}` retains all defaults. `collections` is an object
keyed by any of the supported collection names listed below. Unknown configuration keys and
unsupported collection names fail validation, including unknown properties inside a collection or
management object. Each collection accepts these properties:

| Property        | Accepted value and effect                                                                                                                                              |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `operationMode` | Exact `insert-missing`, `insert-update`, or `full-idempotent`. Overrides the global mode for this collection unless CLI `--mode` is supplied.                          |
| `fields`        | Array of field names, or `null` to clear the built-in projection and use the existing all-fields behavior.                                                             |
| `filter`        | Directus filter object, or `null` to clear the built-in extraction filter. This does not constrain synchronization deletes.                                            |
| `sort`          | Array of sort strings, or `null` to clear the built-in sort option.                                                                                                    |
| `deep`          | Directus deep-query object, or `null` to clear the built-in deep-query option.                                                                                         |
| `management`    | Whole range object with `type: "id-range"` and optional safe-integer numeric `min`/`max`; at least one bound is required. `null` is invalid. See seeding safety below. |

See [Directus query parameters](https://directus.com/docs/guides/connect/query-parameters) and
[filter rules](https://directus.com/docs/guides/connect/filter-rules) for query syntax. Query
structure is validated before extraction cleanup; database-specific field and relation validation
still occurs in Directus during reads. Combine comparisons on the same field as separate objects
inside `_and`; multiple operators in one field predicate are rejected because Directus applies only
the first. Those read errors can leave partial output under the existing extraction recovery
behavior below. Overrides are shallow by property: an omitted property retains its default, while
each provided array, `filter`, `deep`, or `management` replaces that whole value. There is no
recursive merge. For example, supplying a presets `filter` replaces the built-in `user = null`
filter; include that rule yourself if you still need it. `fields`, `filter`, `sort`, and `deep` may
be `null` to clear an option; `operationMode` and `management` may not.

Before replacing `fields`, inspect `seed config --defaults --collection directus_roles` (or the
collection you are changing). Copy every built-in field you want to retain into your replacement
array: unlisted defaults are dropped. For example, `"fields": ["id", "name"]` replaces the entire
roles projection and omits `icon`, `description`, and `parent`; it does not add to the built-ins.

`system.order` is an array of unique supported collection names forming a priority prefix. Remaining
built-ins are appended in their original order. It changes processing order without selecting
collections; configuring a single entry under `collections` also leaves every other collection
available. Use CLI `--include`/`--exclude` or the corresponding environment lists for selection.
Preserve dependency ordering when choosing a prefix. Batch size and error continuation remain global
environment settings. This config does not add collections, alter automatic-extraction selection, or
change cleanup and binary asset behavior.

For each selected collection, the effective seeding mode is explicit CLI `--mode`, then collection
`operationMode`, then `SEEDER_MODE` (default `insert-missing`). The example leaves `operationMode`
unset, so every collection uses the global fallback unless CLI `--mode` overrides it. Its management
range limits extraction and full-idempotent synchronization; it does not limit insert-missing or
insert-update imports. Safety opt-in and confirmation prompts inspect the effective modes of
selected collections with present seed files, including `[]`. Missing files require no confirmation
or opt-in. Required input errors still abort before database operations. CLI mode overrides never
change `management`.

The built-in presets extraction now retains only `user = null`, with no ID cap. Without a consumer
config, it includes matching presets with IDs `>= 50000`. The example's `management.max = 50000`
restores extraction of only IDs below 50000, combined with that built-in user filter. This number is
a project convention, not a Directus limit or a built-in ownership boundary. A management range also
bounds full-idempotent deletion; review the extraction-filter caveat below before restoring an
export.

### Password examples: shared Compose and standalone Directus

In this repository's root `.env`, use the plain shared password without `string:`. Compose uses it
for PostgreSQL and Redis and adds `string:` only when forwarding `DEFAULT_PASSWORD` to Directus:

```dotenv
# Root .env used by the shared Compose stack
DEFAULT_PASSWORD=123456
```

For a standalone Directus process that reads its own environment directly, explicitly force a
password that looks numeric or boolean to remain a string:

```dotenv
# Standalone Directus .env, without the shared Compose mapping
DEFAULT_PASSWORD=string:123456
# A boolean-like alternative is DEFAULT_PASSWORD=string:false
```

Use a deployment-specific secret; the values above illustrate casting only.

## Seed files and supported collections

Supply one JSON array per collection as `<seeds-dir>/<collection>.json`, with stable `id` values and
Directus foreign-key IDs. For example, `directus_roles.json`:

```json
[
  {
    "id": "2a7d5e56-ba21-4fe5-b18e-f0d7147c7ae0",
    "name": "Editor",
    "icon": "edit"
  }
]
```

The default order below is used for seeding and extraction unless `system.order` overrides its
prefix. Extraction uses the listed defaults unless consumer configuration overrides them; imported
JSON may contain additional Directus fields.

| Collection, in processing order | Extracted fields and filter                                                                                                                                                                                               |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `directus_policies`             | `id`, `name`, `icon`, `description`, `ip_access`, `enforce_tfa`, `admin_access`, `app_access`                                                                                                                             |
| `directus_roles`                | `id`, `name`, `icon`, `description`, `parent`                                                                                                                                                                             |
| `directus_users`                | `id`, `avatar`, `first_name`, `last_name`, `title`, `description`, `email`, `password`, `status`, `provider`, `role`, `email_notifications`, `tags`, `language`                                                           |
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

`directus_extensions`, custom collections, schema, and other system collections are outside this
scope. Extraction includes user password data and potentially other secrets in settings, Flow
options, or arbitrary fields. Review output before sharing or committing it; license-field omission
is not general secret redaction. This is not a complete database or storage backup.

### Seed input semantics and preflight

The configured `SEEDER_SEEDS_DIR` must exist and be a directory. A missing directory or a path that
is not a directory fails with the configured path in the error and exit code 1. An existing
directory without any selected system seed files logs a warning with its path and exits 0 without
database operations, service creation, or cache clearing. Unsupported files and seed files inside
subdirectories do not count. A directory with only some supported files is valid; missing collection
files are skipped. An empty collection selection is also a successful no-op.

Seed input uses `<seeds-dir>/<collection>.json`; files for collections outside the supported list
above are ignored. The Seeder resolves include/exclude before preflight: each CLI list overrides
only its corresponding environment list, and exclusions win. Before any database mutation, selected
seed files and their data transformations are validated, plus any Flow metadata required for
Operations filtering below. Invalid or unreadable required input aborts before any selected
collection is mutated, even with `SEEDER_CONTINUE_ON_ERROR=true`. Unselected files are ignored
silently unless required as Flow metadata.

- A missing file (ENOENT only) omits the collection and its data: no database operations run for it
  in any mode, including `full-idempotent` deletes. A missing file never becomes empty input.
- A valid `[]` is intentional empty data. `insert-missing` adds nothing; `insert-update` adds or
  updates nothing. In `full-idempotent` mode, with its existing safeguards satisfied, it deletes
  every existing row of the selected collection, or only rows inside its configured management range
  when one is defined.
- For required input, invalid JSON syntax, a non-array JSON root, a zero-byte or whitespace-only
  file, and non-ENOENT read errors throw a file-context error naming the file; the CLI exits 1
  regardless of `SEEDER_CONTINUE_ON_ERROR`.

### Retained import transformations

Root-user matching is case-insensitive: title exactly `super user`, or first name `admin` with last
name `developer` or `user`. Matching records receive `DEFAULT_EMAIL` and `DEFAULT_PASSWORD` (or the
defaults above), and status `active` only in exact `development`, otherwise `suspended`. Matching is
based on these fields, not administrator permissions, and does not create a user when no matching
seed exists. In update modes these transformations overwrite seeded target values.

Policy `enforce_tfa: true` stays true in every environment. In exact `production`, policies with
`admin_access: true` or `app_access: true` also receive `enforce_tfa: true`. Otherwise it is false.
This preserves explicit enforcement during development extraction.

Outside exact `development`, flows whose names contain `[dev]` (case-insensitive) and operations
belonging to those flows in the seed data are filtered out. Selecting Operations requires any
existing `directus_flows.json` as filter metadata, even when Flows are excluded. Invalid or
unreadable Flow metadata aborts preflight; a missing Flow file supplies no IDs to filter. This never
imports unselected Flows. In exact `development`, the filter is inactive and an unselected Flow file
is ignored, including invalid content. A selected Flow file is always validated.

Operations receive reference-free records followed by reference updates in the same collection
input. This retains legacy batching behavior: reference restoration can be skipped in
`insert-missing` or fail during import. Verify Flow links after use; there is no guaranteed separate
transactional two-pass import.

## Seeding safety and retained caveats

`insert-missing` creates missing IDs; `insert-update` upserts records; `full-idempotent`
additionally deletes target IDs absent from the selected seed data, within any configured management
range. Stable IDs are necessary for repeatability. Without a management range, ID-less input retains
legacy batch-dependent handling and should not be used for synchronization.

If any selected collection with a present seed file has effective mode `full-idempotent`, the
interactive run requires typing exact `DELETE`. Otherwise, any such `insert-update` mode prompts for
yes/no, defaulting to no. Both prompts are skipped by `--force`, `--yes`, CI detection, or non-TTY
execution. Cancellation returns exit code zero. Any selected full-idempotent mode with a present
seed file still requires its environment gate, even when configured only in the JSON file:

```sh
SEEDER_ENABLE_FULL_IDEMPOTENT=true npx directus seed system --mode full-idempotent --include directus_roles --yes
```

Review seed files and back up the target first. Preflight validates required seed input before any
database mutation (see "Seed input semantics and preflight" above): missing selected files omit
their collections, while invalid or unreadable required files abort with a nonzero exit code. In
full-idempotent mode, intentional empty data (`[]`) for a selected collection deletes every existing
target record in its management range, or the whole collection when no range is defined. Deletes
still require the explicit opt-in and confirmation safeguards above. Extraction filters, omitted
fields, and environment transformations mean an extract is not necessarily a safe full-idempotent
restore source.

Per-collection `management` supports only `type: 'id-range'`, with optional inclusive `min` and
exclusive `max` bounds; at least one bound is required. Bounds and ranged seed IDs must be
JavaScript safe-integer numbers, without numeric-string coercion. Empty ranges, unknown keys or
types, `null`, nonfinite, fractional, or unsafe bounds, and `min >= max` are invalid. Consumer
configuration validates ranges even when another mode is effective. Before any database operations,
all selected collections with present seed files and effective `full-idempotent` mode are
preflighted. Invalid management or a ranged record with a missing, nonnumeric, unsafe, or
out-of-range ID aborts the entire import, even with `SEEDER_CONTINUE_ON_ERROR=true`.

Ranged synchronization preserves records outside the range and deletes only in-range IDs absent from
the seed data; `[]` deletes only within that range. Missing files still skip all collection work.
Imports in `insert-missing` and `insert-update` ignore management, and explicit CLI `--mode` always
preserves the configured range. No collection has management configured by default, including
`directus_presets`; without a range, full-idempotent retains whole-collection synchronization.

Extraction combines the management range with the separate extraction `filter` using AND.
Full-idempotent deletion uses only the management range, never the extraction filter. A narrower
filter can omit in-range records from an export; importing that export in full-idempotent mode can
then delete those records. For example, the default presets `user = null` filter omits personal
presets even within a configured range, but it does not protect them from full-idempotent deletion.
Review the complete intended range before using extracted JSON as a synchronization source.

Operations are batched without an extension-wide transaction or rollback. Preflight checks array
boundaries, transformations, and managed IDs; it does not add complete per-collection record schemas
or validate binary assets. Database or asset import errors can still occur after earlier mutations.
Every failed mutation is reported with its collection and makes `seed system` exit 1.
`SEEDER_CONTINUE_ON_ERROR=false` (default) stops seeding on the first failed collection. With
`true`, the failed collection stops and seeding continues with the next collections, but the final
exit code is still 1. The option controls continuation, not whether failures count as success. A
fully successful run and valid no-ops retain exit code 0.

Earlier successful mutations, including uploads within a failed batch, are not automatically rolled
back. Fix the cause and inspect resulting data before rerunning. Counts may omit partial progress
within a failed batch. The command attempts to clear the Directus system cache after collection
processing, including a partial failure with either continuation setting. If cache clearing itself
fails, the command also exits 1; cached state may remain stale until cleared. Required seed-input
preflight errors still abort before mutations, regardless of this option. Extraction database read
errors fail the run; see the recovery guidance below.

## Extraction, assets, and automatic behavior

Extraction uses JavaScript `JSON.stringify` to write valid, readable JSON with tabs by default, or
one through ten spaces via `SEEDER_JSON_INDENT=space` and `SEEDER_JSON_INDENT_SIZE`. Output has
exactly one final newline. The same input produces the same output. The Seeder does not invoke a
formatter or guarantee project-specific formatting rules.

Every run first cleans output unless manual `--skip-clean` is set:

- The seeds directory loses only its direct regular `.json` files, including unselected JSON.
- With binary extraction enabled, the assets directory loses all its direct regular files, even when
  `directus_files` is empty.
- Cleanup never enters subdirectories, recurses, or follows symlinks. Non-JSON files in the seeds
  directory and nested directories remain. Include/exclude selects JSON output, never cleanup scope.

Matching files include hand-created or uncommitted output. Git can restore committed versions; it
cannot restore uncommitted content removed by cleanup. Use dedicated output directories. Before the
first deletion, extraction preflights both configured output paths, including in JSON-only mode, and
refuses filesystem roots, symlinked directories or directory ancestors, equal seeds and assets
directories, or an assets directory that is a parent of the seeds directory. Assets may live inside
the seeds directory or in a separate external directory. `SEEDER_ASSETS_DIR` is independent of
`SEEDER_SEEDS_DIR`; set both when relocating both outputs.

Every selected collection overwrites its JSON file, including an empty collection as `[]` plus
exactly one newline (`[]\n`), even with `--skip-clean`. That flag preserves other output but does
not preserve stale contents of selected files. Extraction database read errors fail the run rather
than writing an empty result. Extraction has no whole-run transaction or rollback: cleanup or
earlier writes may already have happened, leaving partial output. Fix the error and rerun extraction
to recover a complete export; inspect output and logs before using it for seeding.

JSON-only mode (`SEEDER_JSON_ONLY=true` or manual `--json-only`) never reads, downloads, or deletes
binary assets. It still extracts `directus_files.json` when selected, with the same cleanup and
serialization as any other collection JSON. Use this mode to keep local binaries intact, including
with a nested assets directory. Manual `--assets` overrides environment JSON-only mode; combining
`--assets` with `--json-only` is an error.

With binary extraction enabled, extraction queries **all** `directus_files`, regardless of JSON
inclusion/exclusion, and writes binary contents under `filename_disk` in the assets directory. Each
asset is buffered in memory. Failed downloads fail the extraction run; inspect asset counts and
errors, fix the cause, and rerun to recover partial output. File seeding reads these local files and
uploads through Directus `FilesService`, preserving supplied IDs. Updates re-upload assets too;
missing binaries or `filename_disk` cause errors. JSON-only mode affects extraction, not file
import. The hook does not provision storage.

Copyable manual examples (all require exact `DEPLOYMENT_ENV=development`):

```sh
# Default clean export: selected JSON plus all binary assets
DEPLOYMENT_ENV=development npx directus seed extract
# JSON-only export: clean JSON, preserve every binary
DEPLOYMENT_ENV=development npx directus seed extract --json-only
# Preserve other files while refreshing selected JSON, including empty collections
DEPLOYMENT_ENV=development npx directus seed extract --json-only --skip-clean --include directus_roles
# Explicitly enable binaries when the environment defaults to JSON-only
DEPLOYMENT_ENV=development SEEDER_JSON_ONLY=true npx directus seed extract --assets
# Store assets outside the seeds directory
DEPLOYMENT_ENV=development SEEDER_SEEDS_DIR=./seeds SEEDER_ASSETS_DIR=./seed-assets npx directus seed extract
```

Automatic extraction requires both exact `DEPLOYMENT_ENV=development` and
`SEEDER_AUTO_EXTRACT=true`. Selected collections' create/update/delete actions schedule a 15-second
debounce; further events, including other processes' marker updates, extend it. A `users.update`
payload containing only `last_page`, or an empty payload, is ignored. File uploads do not
necessarily emit the create/update events monitored here; use manual extraction when needed.

Auto-extract always uses the same default cleanup, `SEEDER_JSON_ONLY`, `SEEDER_JSON_INDENT`, and
`SEEDER_JSON_INDENT_SIZE` as manual extraction; it has no skip-clean setting and never invokes a
project formatter. Accept this output as-is, adapt or exclude it in your formatter configuration, or
arrange a separate consumer workflow. Auto-extract remains a development-only opt-in
(`SEEDER_AUTO_EXTRACT=false` by default). Each debounced run may clean and export all assets again,
including large binaries. Repeated changes can cause substantial disk I/O, network traffic, and
elapsed time. Debouncing is not incremental extraction; performance optimizations are deferred.

Coordination retains temporary files `directus-lock-bulk-operation.flag` and
`directus-debounce-seed-system-extract.lock` in the process temporary directory. Bulk flags older
than five minutes are treated as stale; ownership is not renewed. Manual commands fail before doing
work if an active flag already exists. Automatic work skips contention and removes its debounce
marker instead of retrying. Cleanup runs only for a successfully acquired flag and checks its owner,
leaving an already-replaced flag intact. Synchronous process-exit cleanup also covers cancellation
from confirmation prompts. Expiration can still allow overlap, and filesystem checks and removal are
not atomic across processes. These remain local coordination limits, not a distributed lock or a
guarantee against overlap. Run commands sequentially and keep extraction writers stopped during
deployment seeding. Processes with separate temporary filesystems do not coordinate. After
interruption, inspect active operations before removing stale flags or retrying; partial database
changes and output files may remain.

If commands are missing, check installation, extension loading, and `SEEDER_ENABLED`. For missing
extraction also check the exact deployment environment. For automatic extraction check its switch,
selected collections, the debounce delay, and bulk flag. For failures inspect Directus logs,
directory permissions, runtime dependencies, storage configuration, and required local assets.

## Consumer formatting workflow

For project-specific formatting, wrap manual extraction and your own formatter in one project
script. For example, with Directus installed locally and Oxfmt chosen by the consumer:

```sh
pnpm add -D oxfmt
```

```json
{
  "scripts": {
    "seed:extract": "DEPLOYMENT_ENV=development SEEDER_SEEDS_DIR=./seeds SEEDER_ASSETS_DIR=./seeds/assets directus seed extract && oxfmt 'seeds/*.json'"
  }
}
```

Run `pnpm seed:extract` from that project. The consumer owns the formatter installation, version,
configuration, paths, and execution environment. Use the project's own Oxfmt configuration, or
replace the final command with its Prettier or Biome command. The `&&` runs formatting only after
the extraction command exits successfully and propagates formatter failures; inspect the extraction
logs and output before consuming the result, and recover failed or interrupted runs as described
above.

For containers, run extraction through the installed Directus CLI (for example, the Docker command
above), bind-mount the seed output to the host, and run the formatter in the host/workspace where
its dependencies and configuration are available. Adjust the paths and environment syntax to your
consumer setup. The Seeder supplies no formatter dependency, callback, hook, watcher, or container
image. A Git hook can provide an additional check, but the normal project extraction script should
apply the formatter directly. This manual script does not run after auto-extract.

## License

MIT. See `LICENSE` in the installed package.
