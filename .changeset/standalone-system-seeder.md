---
'@onderwijsin/directus-seeder-hook': major
---

Release the Seeder as `1.0.0` for Directus 12 and Node.js 24.10 or newer.

- Import system records and configured application collections with `seed system` and `seed core`.
  Choose insert-missing, insert-update, or full-idempotent per collection or command; destructive
  synchronization requires explicit opt-in and supports ID-range, relation, and manifest boundaries.
- Configure collection queries, management, and dependency order through optional JSON configuration;
  inspect effective settings with read-only `seed config`. Core supports live-schema primary keys
  with UUID, string, or safe-integer values.
- Extract JSON into separate `system/` and `core/` directories with development-only `seed extract`.
  System extraction can also export binary assets. Enable automatic extraction independently per
  scope, with a shared debounce and optional collection allowlist.

Validate required inputs before mutations, retain managed-ID history across exports, and report
mutation failures through nonzero CLI exit codes. Review cleanup, destructive scope, secrets, and
partial-failure recovery before use. Imports remain explicit: no startup seeding or schema changes.
