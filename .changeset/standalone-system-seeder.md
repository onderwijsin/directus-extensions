---
'@onderwijsin/directus-seeder-hook': major
---

Release the standalone Directus system seeder hook as its first `1.0.0` release with `seed system`,
development-only `seed extract`, and optional automatic extraction. Support Directus 12 and Node.js
24.10 or newer, preserve seeding defaults and transformations, and document destructive
synchronization, asset handling, environment transformations, and operational limitations.

Validate all `SEEDER_*` options plus `DEPLOYMENT_ENV`, `DEFAULT_EMAIL`, `DEFAULT_PASSWORD`, and
`STORAGE_LOCATIONS` once at startup after Directus environment type casting, and reuse the validated
configuration across commands, automatic extraction, transformations, and file imports.
`SEEDER_ENABLED=false` disables the hook before remaining validation. Invalid provided environment configuration
fails startup even when a CLI option would override it. Keep Directus logging and raw process CI
controls outside the hook's schema.

Require booleans and integer numbers without string coercion or truncation, reject blank paths and
invalid list entries, and accept supported environment modes/scope case-insensitively without silent
fallbacks. Normalize singular strings and Directus-cast arrays to trimmed string lists without
comma-splitting strings forced with `string:`. Preserve exact deployment-name semantics and string
credential defaults, including explicit empty strings; numeric or boolean-like credentials require
Directus's `string:` prefix in standalone Directus configuration. Shared Compose instead expects
a plain root `.env` password and adds the prefix when forwarding it to Directus.

Resolve each collection's mode as explicit CLI `--mode`, then JSON collection `operationMode`,
then `SEEDER_MODE`/`insert-missing`; explicit CLI modes remain case-sensitive. Evaluate safety
opt-in and prompts across selected collections with present seed files, including `[]`; missing
files do not require destructive confirmation or opt-in. Reuse loaded, validated input for import
and retain full preflight before mutations. CLI mode overrides preserve management. Use
`SEEDER_SEEDS_DIR` for the seed path and `SEEDER_JSON_ONLY=false` for JSON plus binary extraction
by default, except selective automatic extraction without `directus_files` remains JSON-only.
`SEEDER_JSON_ONLY=true` and manual `--json-only` disable all binary reads, downloads, and
cleanup; `directus_files.json` remains ordinary selected JSON. Manual `--assets` overrides
environment JSON-only mode and is mutually exclusive with `--json-only`. File imports without seed
`storage` use the first validated `STORAGE_LOCATIONS` entry, including Directus-cast arrays, instead
of an unintended `local` fallback. Retain the existing asset import algorithm and operational safety
caveats.

Write extracted JSON with JavaScript serialization and exactly one final newline. Configure
`SEEDER_JSON_INDENT=tab|space` (default `tab`) and `SEEDER_JSON_INDENT_SIZE=1..10` (default `2`,
always validated but applied only to spaces). Migrate old `SEEDER_JSON_INDENT=2|4` settings to
`space` plus the matching size. Keep project-specific formatting in consumer workflows, without a
Seeder formatter dependency. Automatic extraction uses the same serialization and remains disabled
by default.

Clean extraction output by default for manual runs and automatic runs without an explicit
auto-extract allowlist, with manual-only `--skip-clean` to preserve other output. Clean only direct
regular `.json` files in the seeds directory and, when binaries are enabled, all direct regular
files in the assets directory, even
when no file records exist. Never recurse into subdirectories or follow symlinks. Include/exclude
selects JSON only and never narrows cleanup or binary extraction; binaries always come from all
`directus_files`. Support nested or separate assets directories. Preflight paths before deletion
and refuse filesystem roots, symlinked directories or directory ancestors, equal output directories,
and an assets directory that contains the seeds directory.

Always overwrite every selected collection JSON, including empty results as `[]` plus exactly one
newline, even with `--skip-clean`. Database read errors fail extraction; cleanup and earlier writes
can leave partial output, so fix the error and rerun to recover.

Require the configured seed directory to exist and be a directory; otherwise fail with its path and
exit 1. Warn and exit 0 without database operations, service creation, or cache clearing when no
selected system seed files are present, including an empty collection selection. Ignore unsupported
files and nested seed files when determining this no-op. Present `[]` still processes its collection.

Resolve include/exclude before seed-input preflight: each CLI list overrides its corresponding
environment list, and exclusions win. Validate selected seed files and their transformations before
any database mutation. Ignore unselected invalid or unreadable files silently, except required Flow
metadata and relation sources below. Skip missing target files (ENOENT only) without collection
operations in any mode. Preserve valid `[]` as intentional empty data, including deleting existing records in explicitly enabled and
confirmed `full-idempotent` mode, limited to its configured management boundary. Required
input with invalid JSON, non-array roots, zero-byte or whitespace-only files, or other read errors
fails with file context and exit 1 regardless of `SEEDER_CONTINUE_ON_ERROR`. Retain existing record
validation and strategies without adding transactions or rollback.

Add optional `SEEDER_CONFIG_PATH` for a consumer JSON file resolved relative to the Directus
runtime working directory. With no path, retain built-in system collection defaults. An explicitly
configured missing, unreadable, malformed, or invalid file fails before database mutations or
extraction cleanup, without fallback. Read JSON when resolving runtime configuration: each import,
extraction, or normal inspection invocation reloads it, while automatic extraction captures it at
hook registration. Validate query structure before cleanup; database-specific field and relation
checks remain Directus read behavior.
Keep config files outside managed seed/asset output, with no cleanup exception. Strictly validate
optional string `$schema`/`$comment` metadata and `system.collections`/`order`,
rejecting unknown keys and unsupported collections. Allow existing collections to override mode,
fields, filter, sort, deep query, and management. Merge shallowly by property: provided arrays and
objects replace whole values; omitted properties retain defaults. Allow `null` to clear only fields,
filter, sort, and deep. Treat order as a unique known-name priority prefix with remaining built-ins
appended in original order; keep include/exclude as collection selection. Publish the example JSON
and exported JSON Schema without a TypeScript loader or new dependencies. The example omits
`operationMode`, retaining the global fallback; its management limits extraction and full-idempotent
synchronization, not insert-mode imports. Batch/error settings, automatic-extraction selection,
and cleanup remain unchanged.

Add read-only `seed config` inspection of effective collection settings, full resolved order, and
resolved modes, with `--defaults` for built-ins independent of the consumer JSON file and global
mode, and optional `--collection` filtering. Ignore `$comment` explanatory metadata during
processing. Inspection prints relation management unchanged, reads no seeds, schema, or database
state, and requires no destructive-seeding opt-in.

Support optional consumer per-collection `management` with `type: 'id-range'`, inclusive `min`
and exclusive `max`, requiring at least one safe-integer numeric bound and `min < max` when both
are supplied. Reject `null`, unknown properties, and invalid ranges in configuration. Full-idempotent
preflight rejects missing, nonnumeric, unsafe, or out-of-range seed IDs before database operations.
Combine ID bounds and non-seed-ID exclusions as separate `_and` predicates so Directus applies
every condition. Reject consumer field predicates with multiple operators instead of silently using
only the first. Delete only in-range IDs absent from seeds; bounded `[]` clears that range, and missing files skip
all work. Other import modes ignore management. Keep unbounded synchronization defaults, including
presets. Extraction ANDs the range with its separate filter; deletion uses only the range, never the
extraction filter. A narrow extraction filter may omit in-range records that full-idempotent import
subsequently deletes.

Also support `management: { type: 'relation', field: 'policy', collection: 'directus_policies' }`
for one direct scalar M2O foreign key to the related collection's `id` primary key. Both collections
remain limited to supported system collections. Read membership from raw related `<collection>.json`
IDs even when that source collection is excluded; require a present readable valid array with
explicit schema-compatible canonical lowercase UUID, nonempty string, or safe-integer IDs.
Reject uppercase UUID inputs and duplicate source IDs before mutations; preserve arbitrary string key case. Do not recursively resolve
source management or evaluate source filters, ranges, or environment transformations.
Full-idempotent preflight validates every selected collection's required input, relationship schema,
membership, and existing seed-ID collisions outside that membership before any mutation. Other
import modes ignore management. Source `[]` selects nothing and skips target collection reads and
mutations, rejecting nonempty target seeds; missing target files skip work, while target `[]` clears
only current membership. Missing or invalid required sources reject the run.

Read extraction source IDs before existing cleanup or any writes, AND membership with the target's
configured extraction filter, and reject missing sources before cleanup. Retain normal cleanup and
overwrite behavior: source files can be removed or replaced, with no special preservation. Document
reviewing and preserving source data, plus the absence of historical ownership: removing a policy
ID relinquishes its selection. Retain the ID and import permissions as `[]` before relinquishing it;
review parent deletes/cascades separately. Add no historical manifest, transaction, or concurrency
guarantees.

Remove the built-in presets `id < 50000` extraction cap while preserving `user = null`. Without
consumer configuration, extraction now includes matching presets with IDs at or above 50000. Show
consumer `management.max = 50000` to restore the extraction cap and bound synchronization; 50000 is
a project convention, not a Directus limit or built-in ownership boundary.

Report database and asset mutation failures with collection context and always exit 1 if any
collection fails. `SEEDER_CONTINUE_ON_ERROR=false` stops on the first failed collection; `true`
continues with later collections while retaining the failed status. Stop the failed collection
without continuing its batches or destructive cleanup. Attempt system-cache clearing after partial
seeding with either setting. Earlier successful mutations are not automatically rolled back, and
failed batches can leave progress not reflected in counts. Successful runs and valid no-ops exit 0.

Outside exact `development`, selecting Operations requires any existing `directus_flows.json` as
metadata for filtering development-only Operations, even when Flows are excluded. Invalid or
unreadable Flow metadata fails preflight; missing Flow input supplies no IDs to filter. This never
imports unselected Flows. In exact `development`, unselected Flow input is ignored, including invalid
content. Selected Flow input is always validated.

Keep automatic extraction development-only and opt-in, with the existing events, 15-second debounce,
and bulk lock. Add optional `SEEDER_AUTO_EXTRACT_INCLUDE`: a nonempty, trimmed, case-sensitive list
of supported collections that replaces general include/exclude only for automatic extraction.
Only its collections' CRUD events trigger a run; every run exports all selected collections in
effective configuration order with their existing query settings. Skip JSON and asset cleanup in
this selective mode, preserving other output and potentially stale files. Without `directus_files`,
force JSON-only; with it, retain export of all binaries when `SEEDER_JSON_ONLY=false`, independently
of JSON filters or management ranges. An unset allowlist preserves general selection, cleanup, and
asset behavior. Manual import/extraction and the JSON configuration contract remain unchanged.
Repeated full exports of large assets may consume substantial I/O, network traffic, and time.
Performance optimizations remain follow-up work.

Bind bulk-operation flag cleanup to each successful acquisition. Failed commands preserve another
operation's flag, and an expired owner leaves an already-replaced flag intact. Apply the same
ownership check to automatic extraction and synchronous process-exit cleanup, including prompt
cancellation. Retain the existing five-minute stale policy and local best-effort coordination.

Adapt only inherited built-in `directus_folders.type` and `directus_flows.folder` extraction
selections to the live Directus schema, retaining both fields on versions with Flow-folder support.
Preserve explicit consumer field overrides and read-only configuration inspection. Before import
mutations, translate only unsupported `type: "files"` and `folder: null` to their older equivalent;
reject other supplied values with file, row, and field context instead of losing Flow-folder data.
