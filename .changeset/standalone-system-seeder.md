---
'@onderwijsin/directus-seeder-hook': major
---

Add the standalone Directus system seeder hook with `seed system`, development-only `seed extract`,
and optional automatic extraction. Support Directus 12 and Node.js 24.10 or newer, preserve seeding
defaults and data-handling behavior, and document destructive synchronization, asset handling,
environment transformations, and operational limitations.

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
Directus's `string:` prefix.

Honor `SEEDER_MODE` when CLI `--mode` is omitted; explicit CLI modes remain case-sensitive. Honor
`SEEDER_EXTRACT_ASSETS=false` for manual and automatic extraction, with `--assets` as an explicit
manual enable override. File imports without seed `storage` use the first validated
`STORAGE_LOCATIONS` entry, including Directus-cast arrays, instead of an unintended `local`
fallback. Retain the existing asset import algorithm and operational safety caveats.

Write extracted JSON with JavaScript serialization and exactly one final newline. Configure
`SEEDER_JSON_INDENT=tab|space` (default `tab`) and `SEEDER_JSON_INDENT_SIZE=1..10` (default `2`,
always validated but applied only to spaces). Migrate old `SEEDER_JSON_INDENT=2|4` settings to
`space` plus the matching size. Keep project-specific formatting in consumer workflows, without a
Seeder formatter dependency. Automatic extraction uses the same serialization and remains disabled
by default.
