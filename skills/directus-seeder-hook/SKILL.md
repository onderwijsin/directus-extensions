---
name: directus-seeder-hook
description: Seed, extract, inspect, configure, and troubleshoot Directus system and core data.
---

# Directus seeder hook

Use `@onderwijsin/directus-seeder-hook` for JSON-based system and configured application-record
seeding, manual development extraction, and optional system automatic extraction.

## Read the installed contract

Use Directus `>=12.0.0 <13.0.0`, Node.js `>=24.10.0`, and a trusted, non-sandboxed installation.
Install `@onderwijsin/directus-seeder-hook` in the Directus project and restart Directus to load it.

Before configuring or running the hook, read the README shipped with that installed package and its
`seeder-config.schema.json`. The README owns the complete environment/CLI reference, collection
defaults, configuration examples, and safety/compatibility details; keep those references aligned
with the installed version. A normal local installation exposes the README at
`node_modules/@onderwijsin/directus-seeder-hook/README.md`. For other deployments, use the package
artifact or its matching release documentation. Do not substitute newer defaults for the installed
version.

Read the sections relevant to the operation:

- Configuration: **Configuration reference**, **Consumer JSON configuration**, and **Seed files and
  supported collections**; inspect effective settings with `seed config` before changing them.
- Import: **Seed input semantics and preflight**, **Seeding safety and retained caveats**, the
  chosen management method, and system transformations where applicable.
- Extraction: **Extraction, assets, and automatic behavior** and, only for automatic system
  extraction, its allowlist rules.

## Choose and verify the operation

1. Confirm Directus/Node compatibility, trusted extension loading, and runtime dependencies. For
   import or extraction, also verify access to the configured database, storage, seeds root,
   selected scope directory (`<seeds-root>/system/` or `<seeds-root>/core/`), independent system
   asset path, and temporary paths. Complete when the CLI lists `seed config`, `seed system`, and
   `seed core`; extraction also requires exact `DEPLOYMENT_ENV=development`. If using
   `SEEDER_CONFIG_PATH`, verify the JSON file is readable in that runtime and outside extraction
   output, then review its strict collection overrides, order, and management boundaries.
2. Before customizing system properties, compare `seed config --defaults --collection <name>` with
   `seed config --collection <name>`. For core, declare each collection with a required
   `operationMode`, then inspect its effective configuration; core has no package defaults. Complete
   when the JSON confirms the intended resolved mode and every retained field, query property, and
   management object. A supplied `fields` array replaces the whole built-in projection; include
   every field you want to retain. `--defaults` shows built-in modes and management without the
   consumer file; normal inspection reports invalid files.
3. For extraction, choose `--scope system|core|both` (default system), verify dedicated scope and
   system asset paths, cleanup, and binary behavior in the README. Core does no binary work even
   with `--assets`. Extraction creates selected scope directories; it never migrates flat root
   files. Review each collection's explicit extraction query and optional ID-range boundary;
   relation management applies only to import, so extraction needs no existing source seeds.
   Manifest management retains exported IDs in a separate history file. For core, verify the actual
   schema primary-key name and supported type, and include that field or `*` in explicit extraction
   fields; the Seeder never adds it. Review existing manifests. Use `--skip-clean` only for a manual
   run that must retain other output. Complete when every selected JSON file exists (including `[]`
   for empty collections), required manifests contain the exported IDs and prior history, expected
   binaries exist, and logs report no failures. After a read error or interruption, fix the cause
   and rerun to recover output.
4. For seeding, choose `seed system` or `seed core` and verify its scope directory exists; a missing
   directory is an error even when flat seeds exist at the root. Core requires unique explicit
   schema-compatible primary keys, dependency order, and existing schema/related records. Resolve
   include/exclude and review selected files, required Flow metadata, relation-source IDs or
   manifests, environment transformations, and target backup. Resolve every selected effective mode:
   explicit CLI `--mode`, then the collection's effective `operationMode` (required core declaration
   or system override/built-in). Full-idempotent requires `SEEDER_ENABLE_FULL_IDEMPOTENT=true`, even
   with `--yes` or `--force`; `--full-reset` requires that mode and bypasses management. Review the
   strongest safety requirement across that selection and any full-idempotent boundary; extraction
   filters never protect omitted managed records from deletion. Before relinquishing a
   relation-source ID, retain it while importing target `[]`, then verify the clear. Before removing
   historical IDs from a manifest, review any remaining target rows that will leave management.
   Complete when exit code zero, logs, and target records confirm the expected result; import must
   leave manifests unchanged.
5. After system seeding, inspect Flow operation links, policy TFA, matching root-user credentials,
   and uploaded assets where selected. After core seeding, inspect primary keys and scalar
   relations. Complete when those results match the intended environment.
6. For system-only automatic extraction, choose general selection and cleanup by leaving
   `SEEDER_AUTO_EXTRACT_INCLUDE` unset, or supply a nonempty allowlist for selective output without
   cleanup. Require exact `development` and `SEEDER_AUTO_EXTRACT=true`. Complete when a selected
   CRUD event refreshes every selected collection after the debounce, other files remain in
   selective mode, and binaries are exported only under the documented system asset rules. Review
   retained stale files before using the output for seeding.

## Core configuration checks

Treat `core.collections` as the application selection; every entry requires `operationMode`, even
when a CLI mode override is planned. Verify its optional order prefix contains unique declared
names; remaining collections follow declaration order. System defaults do not supply core settings.
Reject Directus system names and the reserved `__proto__` name.

For each core collection, verify the live schema supplies a non-alias scalar primary key. Every
imported row needs an explicit, unique canonical lowercase UUID, nonempty string, or safe integer
matching that field. Explicit extraction fields must include the actual primary-key name or `*`;
there is no consumer primary-key option or silent `id` fallback. Check direct scalar relation
management against the source's actual primary key and same-scope raw seed file; ID ranges require
numeric integer keys. The consumer owns dependency order and existing related records, including
file references. Core neither downloads nor creates binary assets.

Use `seed config --collection <name>` to inspect a declared core collection; `--defaults` has no
core declarations. Use `seed extract --scope core` or `--scope both` for manual extraction and
`seed core` for import. Core automatic extraction is unavailable; the existing automatic allowlist
still accepts system collections only.

## Accept or recover the result

Inspect exit status, collection errors, output JSON/manifests, and actual target records before
accepting a run. Configuration, input, or management preflight errors must abort before mutations;
service failures can leave earlier mutations in place. After extraction failure, inspect partial
output, fix the cause, and rerun with the intended cleanup policy. Keep configuration outside the
managed output directories. The hook neither applies schema nor seeds at startup.
