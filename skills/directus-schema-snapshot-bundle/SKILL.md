---
name: directus-schema-snapshot-bundle
description: Install, configure, snapshot, apply, and migrate Directus split schema snapshots.
---

# Directus schema snapshot bundle

Use `@onderwijsin/directus-schema-snapshot-bundle` to version Directus schema as split YAML files,
apply those files through the CLI, or snapshot schema edits automatically.

## Install and prepare storage

Install in the Directus server runtime and restart Directus:

```sh
pnpm add @onderwijsin/directus-schema-snapshot-bundle
```

Requires Directus `>=12.0.0 <13.0.0` and Node.js `>=24.10.0`. Use a trusted, non-sandboxed
installation permitting custom server extensions and filesystem access. The Directus process needs
read/write permissions for its snapshot folder and temporary directory. Mount the snapshot folder
into containers when it must persist or be supplied by a deployment. The bundle does not create host
volume mounts or manage deployment infrastructure.

## Configure

| Variable                                  | Default               | Accepted values and interactions                                                                                                                                       |
| ----------------------------------------- | --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SCHEMA_SNAPSHOT_ENABLED`                 | `true`                | Boolean `false` or string `false` disables both hooks: no `schema-split` commands or automatic snapshots are registered.                                               |
| `SCHEMA_SPLIT_MANAGEMENT_SNAPSHOT_FOLDER` | `/directus/snapshots` | A nonempty string is trimmed; empty, missing, or nonstring values fall back to the default. CLI paths override this default.                                           |
| `SCHEMA_SPLIT_MANAGEMENT_AUTO_SNAPSHOT`   | `false`               | Boolean `true`, case-insensitive string `true`, and string `1` enable automatic snapshots. All other values disable them. Requires the master switch too.              |
| `SCHEMA_SPLIT_HARD_EXIT`                  | `true`                | Reads `process.env`. Unset, case-insensitive `true`, and `1` cause immediate CLI process exit. `false`, `0`, and other supplied values set `process.exitCode` instead. |

Enable automatic snapshots in a development environment:

```dotenv
SCHEMA_SNAPSHOT_ENABLED=true
SCHEMA_SPLIT_MANAGEMENT_SNAPSHOT_FOLDER=/directus/snapshots
SCHEMA_SPLIT_MANAGEMENT_AUTO_SNAPSHOT=true
```

For a deployment that only applies reviewed snapshots, keep
`SCHEMA_SPLIT_MANAGEMENT_AUTO_SNAPSHOT=false`. To disable the entire bundle while leaving it
installed, set `SCHEMA_SNAPSHOT_ENABLED=false` and restart Directus.

## Create a snapshot

Use a dedicated output directory: snapshot creation clears its contents before writing the new
schema files.

```sh
npx directus schema-split snapshot -o /directus/snapshots
```

Both `-o` and `--output` are supported. Omit the output option to use the configured default:

```sh
npx directus schema-split snapshot
```

Supplying the option without a folder fails. Inspect the generated YAML and commit schema files
using the consumer project's normal review process.

## Apply a snapshot

Review the snapshot and back up the database before applying. The command uses administrator
accountability and invokes `SchemaService.diff()` with `force: true`, followed by
`SchemaService.apply()`. It bypasses Directus version/vendor compatibility checks and applies
immediately without confirmation or a dry run. Objects absent from the snapshot can be removed. Keep
the target Directus version and database vendor aligned with the source snapshot despite the forced
diff.

```sh
npx directus schema-split apply /directus/snapshots
```

The positional folder is optional:

```sh
npx directus schema-split apply
```

For startup pipelines, run apply before starting the server and preserve its failure exit code:

```sh
npx directus schema-split apply /directus/snapshots && npx directus start
```

Apply repeats diff/apply passes until no changes remain, allowing at most ten unsuccessful passes.
Missing or invalid `metadata.yml`, malformed recognized YAML files, service errors, and failure to
converge return a nonzero exit code. This is not an atomic restore of an entire database; inspect
the target after a failed apply before retrying.

The apply hash uses the running Directus version, preserving the host's concurrency check when
forcing a diff from another version. Snapshot creation and migration reject names containing path
separators.

Commands normally call an immediate process exit. For debugging open handles, use soft exit:

```sh
SCHEMA_SPLIT_HARD_EXIT=false npx directus schema-split apply /directus/snapshots
```

Soft exit still sets the command's exit code, but open resources can delay process termination.

## Migrate a monolithic snapshot

Migration reads a monolithic YAML snapshot and writes the split layout without changing the
database:

```sh
npx directus schema-split migrate -i /directus/schema.yaml -o /directus/snapshots
```

`-i`/`--input <file>` is required. `-o`/`--output [folder]` defaults to the configured snapshot
folder when omitted and fails if supplied without a value. Migration does not clear existing output;
choose an empty directory so obsolete files cannot enter a later apply.

## Preserve the snapshot layout

```text
snapshots/
├── metadata.yml
└── collection_<hash>/
    ├── collection_<hash>.yml
    ├── fields/
    │   └── field_<hash>.yml
    └── relations/
        └── field_<hash>.yml
```

Metadata contains the snapshot version, Directus version, and database vendor. Each collection,
field, and relation has a YAML definition. Paths use the lowercase original name plus the first
eight characters of a case-sensitive `object-hash` hash. Original names remain in the YAML; the hash
does not replace them. Preserve the generated layout when editing or moving files.

The split snapshot format does not persist the separate `systemFields` snapshot array. Apply
preserves the target instance's current system-field indexes on every diff pass, including when
applying existing split snapshots. System-field indexes cannot be transferred or removed through
this split format. The bundle manages schema only, not collection records, uploads, or complete
database backups. It provides CLI and server hooks rather than an HTTP endpoint, Studio UI, or Flow
operation.

## Operate automatic snapshots

When enabled, collection, field, and relation create/update/delete events schedule snapshots with a
15-second debounce. A filesystem lock uses a five-minute lease. Automatic snapshots skip work while
`directus-schema-applying.flag` exists in the process temporary directory. Apply creates this flag
and removes it on ordinary completion or failure. Coordination files use `directus-schema-snapshot`
under the process temporary directory. The execution lease is renewed while a snapshot runs.

Coordination is limited to processes sharing the same filesystem storage and temporary directory.
Separate container temporary directories do not provide replica coordination; use one snapshot
writer in that topology. Snapshot files must be writable when automatic snapshots are enabled.

## Troubleshoot

| Symptom                                                          | Check                                                                                                                                                                                       |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `schema-split` commands are missing                              | Confirm package loading, restart Directus, and check `SCHEMA_SNAPSHOT_ENABLED`.                                                                                                             |
| Automatic snapshots are absent                                   | Check both enable switches, wait for the 15-second debounce, and inspect Directus logs and filesystem permissions.                                                                          |
| Automatic snapshots remain suppressed after an interrupted apply | Check for `directus-schema-applying.flag` in the process temporary directory. Remove it only after confirming no apply is running. A forcibly killed process cannot perform normal cleanup. |
| Apply rejects a snapshot                                         | Confirm root metadata, the generated layout, YAML validity, supported Directus version, and database vendor. Read the Directus logger error before retrying.                                |
| Apply reaches the pass limit                                     | Investigate why Directus still reports a diff; the command fails after ten unsuccessful passes.                                                                                             |
| Migrated output contains unexpected definitions                  | Migrate into an empty output directory; migration preserves existing files.                                                                                                                 |
| A soft-exit command remains alive                                | Existing resources may keep Node running. Use default hard exit in startup automation.                                                                                                      |
