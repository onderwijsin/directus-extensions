---
name: directus-seeder-hook
description: Configure, seed, extract, and troubleshoot Directus system and core data.
---

# Directus seeder hook

Use `@onderwijsin/directus-seeder-hook` for explicit JSON imports and development extraction. Read
the installed package's `README.md` before operating it; that is the authoritative configuration,
CLI, defaults, and safety reference. A local npm installation exposes it at
`node_modules/@onderwijsin/directus-seeder-hook/README.md`; otherwise use the matching package
artifact/release documentation. Use its shipped `seeder-config.schema.json` for configuration.

## Establish the runtime and selection

1. Verify Directus `>=12.0.0 <13.0.0`, Node.js `>=24.10.0`, trusted non-sandboxed loading, and
   `SEEDER_ENABLED`. Install the package in the Directus runtime and restart after changes. Confirm
   `seed config`, `seed system`, and `seed core` appear in the installed CLI. The hook uses
   administrator services; it neither applies schema nor imports at startup.
2. Read the README's **Configuration reference**, **Consumer JSON configuration**, and **Seed files
   and supported collections**. Verify database/storage access and readable runtime paths for
   configuration, `<SEEDER_SEEDS_DIR>/{system,core}/`, independent `SEEDER_ASSETS_DIR`, and
   temporary files. Keep config/schema files outside extraction output. Core requires declared
   collections, per-collection `operationMode`, existing schema/related rows, and consumer-owned
   dependency order.
3. Inspect effective settings with `seed config --collection <name>`; compare system settings with
   `seed config --defaults --collection <name>`. Core has no built-in declarations. Review mode,
   order, query, and management for every selected collection. Overrides replace whole properties;
   explicit fields must retain every field needed. Resolve CLI/environment include and exclude
   before proceeding. Inspection does not validate live schema or management input files.

## Import

Read **Primary keys and input preflight**, **System transformations and compatibility**, and
**Seeding safety and management**, including the configured management method.

- Choose `seed system` or `seed core` and verify the scope directory exists. Missing target files
  skip work; valid `[]` can delete the managed selection in full-idempotent. Invalid required input
  must fail before any selected collection mutates.
- Core rows require unique explicit live-schema primary keys, including non-`id` field names:
  lowercase UUID, nonempty string, safe `integer` number, or canonical decimal `bigInteger` string.
  Preserve bigint strings in seeds and manifests, including small IDs (`"2"`) and large IDs
  (`"9007199254740993"`). Accept `0` or an optional minus sign followed by digits without leading
  zeroes; reject numeric bigint IDs, plus signs, leading zeroes, `-0`, whitespace, fractions, and
  exponents. PostgreSQL roundtrips are verified; other databases require Directus and its driver to
  return bigint strings too. Verify scalar foreign keys and dependency order.
- Keep ID-range bounds as safe integer numbers. Seed IDs use their schema representation, with exact
  numeric comparisons for bigint strings. For mixed integer/bigInteger relations, source membership
  uses the FK representation (safe number for integer, decimal string for bigint); unrepresentable
  source IDs fail preflight. Keep seed payloads in their original representation.
- For ordinary users, supply an explicit `password` to create a login-ready development user or
  change an existing password in an updating mode. Omitting it preserves an existing password;
  `insert-missing` never updates existing users. A `password` containing only one or more asterisks
  is rejected before any selected collection mutates, even with continuation enabled and before
  root-user environment overrides. Matching root users still receive an effective seed password from
  `DEFAULT_PASSWORD`, even when their JSON omits `password`. Their email and status transformations
  still apply as described in the README.
- Review a target backup and every effective mode: CLI `--mode`, then collection configuration.
  Full-idempotent requires `SEEDER_ENABLE_FULL_IDEMPOTENT=true` even with `--yes`/`--force`.
  `--full-reset` bypasses management and can delete unmanaged rows in whole selected collections.
- Validate manifests or same-scope raw relation sources when required. Extraction filters never
  protect omitted managed rows from deletion. Before relinquishing a relation-source ID, retain it
  while importing target `[]` and verify the clear. Review surviving target rows before removing IDs
  from manifest history. Imports leave manifests unchanged.
- Accept only after checking exit status, logs, and actual target rows, including system root-user
  credentials/status, policy TFA, Flow links, and file uploads where selected. Mutation failures
  exit 1 even with continuation enabled; earlier mutations are not rolled back. Diagnose partial
  state before rerunning.

## Extract

Read **Extraction, assets, and automatic behavior** before writing output.

- Require exact `DEPLOYMENT_ENV=development`. Manual `seed extract` defaults to system; choose
  `--scope core|both` when needed. Explicit core fields must include the actual primary key or `*`;
  the Seeder never adds it. Relation management does not filter extraction or require source seeds.
- Expect `directus_users.password` to be omitted from extracted JSON even with explicit fields,
  wildcards, or `fields: null`; Directus conceals existing passwords. Reseeding ordinary users from
  that output preserves their passwords. Review other fields for secrets before sharing output.
- Review cleanup first: it removes direct regular scope JSON except manifests, including unselected
  files. System binary export reads all files independently of JSON filters and cleans the asset
  directory. Use `--json-only` to preserve binaries and manual `--skip-clean` to preserve other
  output. Core always leaves binaries untouched, including with `--assets`.
- For auto-extract, enable `SEEDER_AUTO_EXTRACT_SYSTEM`, `SEEDER_AUTO_EXTRACT_CORE`, or both. Omit
  `SEEDER_AUTO_EXTRACT_INCLUDE` for general filters and cleanup in changed scopes; a nonempty
  allowlist overrides filters and skips cleanup. Names must be supported system/configured core
  collections, even for disabled scopes. System allowlists force JSON-only unless `directus_files`
  is included, and still honor `SEEDER_JSON_ONLY`.
- Seeder CLI processes (`seed system`, `seed core`, `seed extract`, and `seed config`) do not
  register automatic extraction hooks.
- Verify selected CRUD events refresh all selected collections within changed enabled scopes after
  the shared 15-second debounce. Core-only changes must leave system JSON/assets untouched. Shared
  bulk-lock contention suppresses auto work without retry; file uploads may need manual extraction.
  Restart to reload auto-extract configuration.
- Accept after checking logs, selected JSON (including `[]` for empty results), manifest history,
  and expected binaries. Inspect secrets before sharing output and stale files retained by selective
  runs. On failure, inspect partial output and rerun deliberately. Run writers sequentially: local
  temporary-file coordination does not guarantee exclusion across processes or deployments.
