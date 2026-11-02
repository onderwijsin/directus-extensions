---
name: directus-seeder-hook
description: Install, configure, seed, extract, and troubleshoot Directus system records.
---

# Directus seeder hook

Use `@onderwijsin/directus-seeder-hook` for JSON-based Directus system-record seeding and optional
development extraction.

## Choose and verify the operation

1. Confirm Directus/Node compatibility, trusted extension loading, runtime dependencies, and access
   to the configured database, storage, seed, asset, and temporary paths. Complete when the
   installed CLI lists `seed system`; extraction also requires exact `DEPLOYMENT_ENV=development`.
2. For extraction, choose dedicated output paths and inspect the clear/assets behavior below before
   running. Complete when the expected JSON/assets exist and logs report no individual failures;
   inspect retained stale files when clearing was disabled.
3. For seeding, review selected seed files and IDs, environment transformations, mode, and target
   backup. Use `--mode` explicitly. Complete when logs and target records confirm the expected
   result; exit code zero alone is insufficient under the retained legacy error handling.
4. After seeding, inspect Flow operation links, policy TFA, matching root-user status/credentials,
   and uploaded assets where selected. Complete when those results match the intended environment.

The reference below covers the complete consumer contract. No project configuration file or
per-collection configuration API is available.

Seed Directus system records from JSON, extract their current state, and optionally extract changes
automatically during development. Use `seed system` to import records and `seed extract` to export
them.

## Install

Install in the Directus project:

```sh
pnpm add @onderwijsin/directus-seeder-hook
```

Requires Directus `>=12.0.0 <13.0.0`, Node.js `>=24.10.0`, and a trusted, non-sandboxed Directus
installation with database, storage, and filesystem access. Restart Directus after installation. See
[including extensions](https://directus.com/docs/self-hosting/including-extensions) for deployment
loading. Installations allowing only sandboxed extensions cannot load this hook.

Retain the package's runtime dependencies when deploying it. Extraction dynamically imports Oxfmt
and needs its platform-specific native binding. Copying only `package.json` and `dist/` into an
extension directory is insufficient for extraction: install and retain runtime `node_modules`
alongside the extension, or preserve the dependency layout produced by your npm/pnpm installation.
The published package declares Oxfmt as a runtime dependency; it is not limited to development
images.

The Directus process must be able to read seed JSON and assets, write extraction output and
temporary files, and access configured Directus storage. Mount persistent paths yourself in
containers. The hook uses Directus services with administrator permissions rather than a caller's
API token.

## Commands and options

```sh
npx directus seed system --mode insert-missing
npx directus seed system --mode insert-update --include directus_roles directus_permissions --yes
DEPLOYMENT_ENV=development npx directus seed extract --clear --assets
```

In hardened Directus images without `npx`, invoke the installed CLI directly, for example:

```sh
docker compose exec directus node /directus/cli.js seed system --mode insert-missing
docker compose exec -e DEPLOYMENT_ENV=development directus node /directus/cli.js seed extract --clear --assets
```

| Option                           | `seed system`                                                                             | `seed extract`                                                                                       |
| -------------------------------- | ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `-m, --mode <mode>`              | `insert-missing` (default), `insert-update`, or `full-idempotent`; other CLI values fail. | —                                                                                                    |
| `-i, --include <collections...>` | Select supported collections.                                                             | Select collections whose JSON is extracted.                                                          |
| `-e, --exclude <collections...>` | Exclude collections after inclusion.                                                      | Exclude collections after inclusion.                                                                 |
| `-f, --force`                    | Skip confirmation prompts.                                                                | —                                                                                                    |
| `-y, --yes`                      | Alias for `--force`.                                                                      | —                                                                                                    |
| `-c, --clear`                    | —                                                                                         | Clear the entire seed directory before extraction and the asset directory when assets are extracted. |
| `-a, --assets`                   | —                                                                                         | Enable asset extraction, which is already enabled by default.                                        |
| `-h, --help`                     | Show command help.                                                                        | Show command help.                                                                                   |

CLI collection names are separate space-delimited arguments, not comma-separated tokens. CLI lists
override their respective environment lists; exclusions always win. Selection does not change the
fixed processing order or add support for custom collections. Neither command accepts a positional
seed path; configure directories through the environment.

`seed system` does not run automatically at server startup. Run it explicitly after database
bootstrap/schema setup. It clears the Directus system cache after seeding. Commands release the
bulk-operation flag and call `process.exit()` in their final cleanup.

## Configuration reference

These values come from the Directus environment. Unless noted otherwise, seeder booleans accept
boolean values or strings `true` (case-insensitive) and `1`; other strings are false. String values
are not trimmed. The master enable switch follows the separate rule in its table entry.

| Variable                                                         | Default                   | Behavior and accepted values                                                                                                                                                                                                                     |
| ---------------------------------------------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `SEEDER_ENABLED`                                                 | `true`                    | Boolean `false` or string `false` disables all command and automatic-hook registration.                                                                                                                                                          |
| `DEPLOYMENT_ENV`                                                 | Unset                     | Only exact `development` registers manual and automatic extraction. Exact `production` adds policy TFA enforcement. Every other value also suspends matching root users and filters development flows during seeding.                            |
| `SEEDER_MODE`                                                    | `insert-missing`          | Recognizes the three modes case-insensitively; unknown environment values fall back to `insert-missing`. The system CLI's default `--mode insert-missing` overrides this variable even when the option is omitted; pass `--mode` explicitly.     |
| `SEEDER_SCOPE`                                                   | `system`                  | Only `system` exists; other values fall back to it. No custom scope is provided.                                                                                                                                                                 |
| `SEEDER_INCLUDE`                                                 | All supported collections | Comma-separated string with trimmed names, or an array supplied by Directus. An empty list includes all. CLI `--include` overrides it.                                                                                                           |
| `SEEDER_EXCLUDE`                                                 | None                      | Same list format as inclusion; exclusions win. CLI `--exclude` overrides it.                                                                                                                                                                     |
| `SEEDER_CONTINUE_ON_ERROR`                                       | `false`                   | Continue to other collections after errors that escape a collection operation. It does not make logged strategy failures fatal; see the error caveat below.                                                                                      |
| `SEEDER_BATCH_SIZE`                                              | `50`                      | Batch size, parsed as a base-10 integer. Supply a positive integer; the legacy parser does not enforce this and invalid/zero/negative values can skip work or prevent progress.                                                                  |
| `SEEDER_ENABLE_FULL_IDEMPOTENT`                                  | `false`                   | Required before `full-idempotent` can delete records. `--force`/`--yes` does not bypass this gate.                                                                                                                                               |
| `SEEDER_CLEAR_DATA_BEFORE_SEED`                                  | `false`                   | Despite its name, controls clearing extraction output, not database clearing before seeding. `--clear` enables it for manual extraction.                                                                                                         |
| `SEEDER_EXTRACT_ASSETS`                                          | `true`                    | Retained legacy fallback makes false/unset values resolve to `true` too. There is no CLI `--no-assets`; excluding `directus_files` does not disable asset extraction.                                                                            |
| `SEEDER_AUTO_EXTRACT`                                            | `false`                   | Enable monitored system-record changes to schedule extraction; also requires exact `DEPLOYMENT_ENV=development`.                                                                                                                                 |
| `SEEDER_SEEDS_FOLDER`                                            | `/directus/seeds`         | Nonempty string, trimmed; blank/missing/nonstring values use the default.                                                                                                                                                                        |
| `SEEDER_ASSETS_DIR`                                              | `/directus/seeds/assets`  | Same path parsing. Independent of the seed folder: changing the seed folder does not relocate this default.                                                                                                                                      |
| `DEFAULT_EMAIL`                                                  | `admin@example.com`       | Replaces the email of matching root-user seed records. An explicitly empty string is retained.                                                                                                                                                   |
| `DEFAULT_PASSWORD`                                               | `p4ssw0rd!`               | Replaces the password of matching root-user seed records. An explicitly empty string is retained. Supply a deployment-specific secret.                                                                                                           |
| `STORAGE_LOCATIONS`                                              | `local` fallback          | Existing Directus storage configuration. File imports use seed `storage` when provided; otherwise the first location in a comma-separated string, or `local` when the parsed value is not a string. The hook does not configure storage drivers. |
| `LOG_LEVEL`                                                      | Directus default          | Standard Directus logging setting; use `debug` or `trace` for diagnostics.                                                                                                                                                                       |
| `CI`, `CONTINUOUS_INTEGRATION`, `BUILD_NUMBER`, `GITHUB_ACTIONS` | Unset                     | Any nonempty raw process-environment value skips CLI confirmations, including the string `false`. Non-TTY stdin or stdout also skips prompts.                                                                                                    |

Example development configuration:

```dotenv
SEEDER_ENABLED=true
DEPLOYMENT_ENV=development
SEEDER_SEEDS_FOLDER=/directus/seeds
SEEDER_ASSETS_DIR=/directus/seeds/assets
SEEDER_AUTO_EXTRACT=true
SEEDER_ENABLE_FULL_IDEMPOTENT=false
```

Disable automatic extraction with `SEEDER_AUTO_EXTRACT=false`. Disable the entire hook with
`SEEDER_ENABLED=false` and restart Directus. There is no project configuration file, per-collection
configuration, TypeScript data-provider API, HTTP endpoint, Studio UI, or Flow operation.

## Seed files and supported collections

Supply one JSON array per collection as `<seeds-folder>/<collection>.json`, with stable `id` values
and Directus foreign-key IDs. For example, `directus_roles.json`:

```json
[
  {
    "id": "2a7d5e56-ba21-4fe5-b18e-f0d7147c7ae0",
    "name": "Editor",
    "icon": "edit"
  }
]
```

The fixed order below is used for seeding and extraction. Extraction selects the listed fields;
imported JSON may contain additional Directus fields. The extraction projections and filters are
built in and are not consumer configuration.

| Collection, in processing order | Extracted fields and filter                                                                                                                                                                                             |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `directus_policies`             | `id`, `name`, `icon`, `description`, `ip_access`, `enforce_tfa`, `admin_access`, `app_access`                                                                                                                           |
| `directus_roles`                | `id`, `name`, `icon`, `description`, `parent`                                                                                                                                                                           |
| `directus_users`                | `id`, `avatar`, `first_name`, `last_name`, `title`, `description`, `email`, `password`, `status`, `provider`, `role`, `email_notifications`, `tags`, `language`                                                         |
| `directus_access`               | `id`, `policy`, `role`, `sort`, `user`                                                                                                                                                                                  |
| `directus_presets`              | `id`, `bookmark`, `user`, `role`, `collection`, `search`, `layout`, `layout_query`, `layout_options`, `refresh_interval`, `filter`, `icon`, `color`; only `user = null` and `id < 50000`, sorted by `-role`, then `id`. |
| `directus_permissions`          | `id`, `collection`, `action`, `permissions`, `validation`, `presets`, `fields`, `policy`                                                                                                                                |
| `directus_folders`              | `id`, `name`, `parent`, `type`; sorted by `-parent`.                                                                                                                                                                    |
| `directus_files`                | `id`, `filename_disk`, `filename_download`, `description`, `title`, `type`, `folder`                                                                                                                                    |
| `directus_dashboards`           | `id`, `name`, `note`, `icon`, `color`                                                                                                                                                                                   |
| `directus_panels`               | `id`, `dashboard`, `name`, `icon`, `color`, `show_header`, `note`, `type`, `position_x`, `position_y`, `width`, `height`, `options`                                                                                     |
| `directus_flows`                | `id`, `name`, `icon`, `color`, `description`, `status`, `trigger`, `accountability`, `options`, `operation`, `folder`                                                                                                   |
| `directus_operations`           | `id`, `name`, `key`, `type`, `position_x`, `position_y`, `options`, `resolve`, `reject`, `flow`; ordered by operation references where possible, with warnings for cycles.                                              |
| `directus_settings`             | All fields except `license_key` and `license_token`.                                                                                                                                                                    |
| `directus_translations`         | `id`, `language`, `key`, `value`; sorted by `key`, then `language`.                                                                                                                                                     |

`directus_extensions`, custom collections, schema, and other system collections are outside this
scope. Extraction includes user password data and potentially other secrets in settings, Flow
options, or arbitrary fields. Review output before sharing or committing it; license-field omission
is not general secret redaction. This is not a complete database or storage backup.

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
belonging to those seeded flows are filtered out. Operations receive reference-free records followed
by reference updates in the same collection input. This retains legacy batching behavior: reference
restoration can be skipped in `insert-missing` or fail during import. Verify Flow links after use;
there is no guaranteed separate transactional two-pass import.

## Seeding safety and retained caveats

`insert-missing` creates missing IDs; `insert-update` upserts records; `full-idempotent`
additionally deletes target IDs absent from the selected seed data. Stable IDs are necessary for
repeatability. ID-less input retains legacy batch-dependent handling and should not be used for
synchronization.

An interactive `insert-update` prompts for yes/no, defaulting to no. `full-idempotent` requires
typing exact `DELETE`. Both prompts are skipped by `--force`, `--yes`, CI detection, or non-TTY
execution. Cancellation returns exit code zero. Full-idempotent still requires its environment gate:

```sh
SEEDER_ENABLE_FULL_IDEMPOTENT=true npx directus seed system --mode full-idempotent --include directus_roles --yes
```

Review seed files and back up the target first. **Missing/unreadable files, malformed JSON,
non-array JSON, and explicit `[]` all become empty collection data** (with warnings for read/parse
failures). The collection remains selected: in full-idempotent mode that empty data can delete every
target record in it. Omitting a file does not exclude a collection. Use explicit include/exclude
selection. Extraction filters, omitted fields, environment transformations, and missing files mean
an extract is not necessarily a safe full-idempotent restore source.

Operations are batched without an extension-wide transaction or rollback. **Some mutation errors are
captured and logged without causing command failure**, even with `SEEDER_CONTINUE_ON_ERROR=false`.
Individual extraction failures are also logged and counted without necessarily failing the command.
A zero exit code or final success log alone does not prove that all records or assets succeeded;
inspect error logs, counts, and resulting data. Uncaught command errors and a disabled
full-idempotent request return a nonzero exit code.

## Extraction, assets, and automatic behavior

Extraction preflights the Oxfmt package and native binding before creating or clearing seed paths.
It overwrites selected nonempty JSON files. Empty collections do not write `[]` or remove old files;
without `--clear`, stale JSON remains. `--clear` clears the entire seed directory, including
unselected JSON and a nested asset directory. Use dedicated output paths.

Asset extraction queries **all** `directus_files`, regardless of collection inclusion/exclusion, and
writes binary contents under `filename_disk` in the asset directory. Each asset is buffered in
memory. When clearing is enabled, the asset directory is cleared only if file records exist; with
none, a separate existing asset directory remains unchanged. File seeding reads these local files
and uploads through Directus `FilesService`, preserving supplied IDs. Updates re-upload assets too;
missing binaries or `filename_disk` cause errors. The hook does not provision storage.

Automatic extraction requires both exact `DEPLOYMENT_ENV=development` and
`SEEDER_AUTO_EXTRACT=true`. Selected collections' create/update/delete actions schedule a 15-second
debounce; further events, including other processes' marker updates, extend it. A `users.update`
payload containing only `last_page`, or an empty payload, is ignored. File uploads do not
necessarily emit the create/update events monitored here; use manual extraction when needed.

Coordination retains temporary files `directus-lock-bulk-operation.flag` and
`directus-debounce-seed-system-extract.lock` in the process temporary directory. Bulk flags older
than five minutes are treated as stale; ownership is not renewed. Automatic work skips contention
and removes its debounce marker instead of retrying. Command cleanup removes the bulk flag even when
acquisition failed, so overlapping commands can remove another operation's flag. These are legacy
coordination limits, not a distributed lock or a guarantee against overlap. Run commands
sequentially and keep extraction writers stopped during deployment seeding. Processes with separate
temporary filesystems do not coordinate. After interruption, inspect active operations before
removing stale flags or retrying; partial database changes and output files may remain.

If commands are missing, check installation, extension loading, and `SEEDER_ENABLED`. For missing
extraction also check the exact deployment environment. For automatic extraction check its switch,
selected collections, the debounce delay, and bulk flag. For failures inspect Directus logs,
directory permissions, runtime dependencies, storage configuration, and required local assets.

## License

MIT. See `LICENSE` in the installed package.
