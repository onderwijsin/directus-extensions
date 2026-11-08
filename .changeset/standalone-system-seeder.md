---
'@onderwijsin/directus-seeder-hook': major
---

Release the standalone Seeder as `1.0.0` for Directus 12 and Node.js 24.10 or newer.
Provide explicit `seed system` and `seed core` imports, development-only `seed extract`, and
read-only `seed config` inspection. Retain system defaults, transformations, and asset handling;
imports never run at startup or apply schema.

Configure optional JSON system overrides and core application collections through
`SEEDER_CONFIG_PATH`. Core declarations require an operation mode, support the same query and
management options, and process an optional order prefix before remaining declarations. Core has
no package collection defaults, relationship resolver, or binary downloads. Use actual schema
primary-key names with UUID, nonempty string, or safe-integer keys; reject invalid schema or seed
keys and explicit core extraction fields that omit the primary key.

Store JSON and managed-ID history under `SEEDER_SEEDS_DIR/{system,core}` without a flat-layout
fallback. Assets remain independent at `SEEDER_ASSETS_DIR` (default `/directus/seeds/system/assets`).
Extraction defaults to system; `--scope system|core|both` selects output, with include/exclude across
selected scopes. Clean direct regular JSON only in selected scope directories, preserve manifests,
and keep `--skip-clean`. Binary work belongs only to system, even with core `--assets`.

Support insert-missing, insert-update, and full-idempotent modes with per-collection defaults or
required core modes and explicit CLI overrides. Retain destructive opt-in, confirmation, selection,
and preflight before mutations. ID-range, same-scope direct scalar relation, and persistent manifest
management bound full-idempotent synchronization; `--full-reset` deliberately bypasses boundaries.
Missing seed files skip work; valid `[]` can clear the managed selection. Mutation failures exit 1,
including when continuation is enabled; successful earlier work has no whole-run rollback.

Validate environment configuration after Directus casting; disabling the hook skips remaining
validation. Keep `SEEDER_SCOPE` system-only. Extract deterministic JSON with configured tab/space
indentation and one final newline. Support JSON-only extraction, explicit assets, safe output paths,
and ownership-aware bulk locking. Replace `SEEDER_AUTO_EXTRACT` with independent
`SEEDER_AUTO_EXTRACT_SYSTEM` and `SEEDER_AUTO_EXTRACT_CORE` switches, both defaulting to false with
no fallback. Coalesce changed scopes through one 15-second debounce and serialize them under the
shared bulk lock. A shared nonempty allowlist accepts supported system and configured core names,
validates disabled-scope names too, overrides general filters, and skips cleanup. Otherwise honor
general filters and clean only event-triggered scopes. Core never touches binary assets; system
retains JSON-only rules, with allowlists forcing JSON-only unless `directus_files` is listed.
Automatic extraction remains development-only and uses each scope's JSON/manifest directory.
Preserve Flow-folder schema compatibility and document secrets, partial-output recovery, and
operational limits.

Use manifest defaults for policies, roles, users, access, folders, and files; policy relation
management for permissions; unbounded full-idempotent for dashboards, panels, flows, operations,
and translations; and insert-update for presets and settings. Remove the presets extraction ID cap
while retaining `user = null`; consumers can configure a numeric range themselves. Keep the README,
consumer skill, example, and exported JSON Schema aligned with the public contract.
