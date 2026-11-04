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
`SEEDER_ENABLED=false` disables the hook before remaining validation. Invalid provided configuration
fails startup even when a CLI option would override it. Keep Directus logging and raw process CI
controls outside the hook's schema.

Require booleans and integer numbers without string coercion or truncation, reject blank paths and
invalid list entries, and accept supported environment modes/scope case-insensitively without silent
fallbacks. Normalize singular strings and Directus-cast arrays to trimmed string lists without
comma-splitting strings forced with `string:`. Preserve exact deployment-name semantics and string
credential defaults, including explicit empty strings; numeric or boolean-like credentials require
Directus's `string:` prefix in standalone Directus configuration. Shared Compose instead expects
a plain root `.env` password and adds the prefix when forwarding it to Directus.

Honor `SEEDER_MODE` when CLI `--mode` is omitted; explicit CLI modes remain case-sensitive. Use
`SEEDER_SEEDS_DIR` for the seed path and `SEEDER_JSON_ONLY=false` for JSON plus binary extraction by
default. `SEEDER_JSON_ONLY=true` and manual `--json-only` disable all binary reads, downloads, and
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

Clean extraction output by default for both manual and automatic runs, with manual-only
`--skip-clean` to preserve other output. Clean only direct regular `.json` files in the seeds
directory and, when binaries are enabled, all direct regular files in the assets directory, even
when no file records exist. Never recurse into subdirectories or follow symlinks. Include/exclude
selects JSON only and never narrows cleanup or binary extraction; binaries always come from all
`directus_files`. Support nested or separate assets directories. Preflight paths before deletion
and refuse filesystem roots, symlinked directories or directory ancestors, equal output directories,
and an assets directory that contains the seeds directory.

Always overwrite every selected collection JSON, including empty results as `[]` plus exactly one
newline, even with `--skip-clean`. Database read errors fail extraction; cleanup and earlier writes
can leave partial output, so fix the error and rerun to recover.

Require the configured seed directory to exist and be a directory; otherwise fail with its path and
exit 1. Warn and exit 0 without database operations or cache clearing when it contains no supported
system seed files. Ignore unsupported files and nested seed files when determining this no-op.
An empty collection selection alone does not trigger this warning.

Resolve include/exclude before seed-input preflight: each CLI list overrides its corresponding
environment list, and exclusions win. Validate selected seed files and their transformations before
any database mutation. Ignore unselected invalid or unreadable files silently, except required Flow
metadata below. Skip missing files (ENOENT only) without collection operations in any mode. Preserve
valid `[]` as intentional empty data, including deleting existing records in explicitly enabled and
confirmed `full-idempotent` mode. Required input
with invalid JSON, non-array roots, zero-byte or whitespace-only files, or other read errors fails
with file context and exit 1 regardless of `SEEDER_CONTINUE_ON_ERROR`. Retain existing record
validation and strategies without adding transactions or rollback.

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

Keep automatic extraction development-only and opt-in, with the existing events and 15-second
debounce. It uses the same cleanup and JSON-only setting; repeated full exports of large assets may
consume substantial I/O, network traffic, and time. Performance optimizations remain follow-up work.
