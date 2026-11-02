---
'@onderwijsin/directus-seeder-hook': major
---

Add the standalone Directus system seeder hook with `seed system`, development-only `seed extract`,
and optional automatic extraction. Support Directus 12 and Node.js 24.10 or newer, preserve seeding
defaults and data-handling behavior, and document destructive synchronization, asset handling,
environment transformations, and operational limitations.

Configure seeding and extraction with `SEEDER_*` environment variables, and enable or disable the
hook with `SEEDER_ENABLED`.

Write extracted JSON with JavaScript serialization, exactly one final newline, and configurable
`SEEDER_JSON_INDENT=tab|2|4` indentation. Keep project-specific formatting in consumer workflows,
without a Seeder formatter dependency. Automatic extraction uses the same serialization and remains
disabled by default.
