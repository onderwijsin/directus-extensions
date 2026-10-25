# @onderwijsin/directus-schema-snapshot-bundle

Split Directus schema snapshots into YAML files for version control, apply split snapshots through
the Directus CLI, and optionally snapshot schema changes automatically.

## Installation

Install in the Directus server runtime, then restart Directus:

```sh
pnpm add @onderwijsin/directus-schema-snapshot-bundle
```

Requires Directus `>=12.0.0 <13.0.0` and Node.js `>=24.10.0`. This is a non-sandboxed bundle for a
trusted installation that permits custom server extensions and filesystem access. The Directus
process needs read/write access to the snapshot folder and its temporary directory. Mount the
snapshot folder into containers when it must persist or be supplied by a deployment.

## Configuration

| Variable                                  | Default               | Behavior                                                                                                                                                                                                                  |
| ----------------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SCHEMA_SNAPSHOT_ENABLED`                 | `true`                | Master switch. Boolean `false` or string `false` disables both CLI registration and automatic snapshots.                                                                                                                  |
| `SCHEMA_SPLIT_MANAGEMENT_SNAPSHOT_FOLDER` | `/directus/snapshots` | Default input/output directory. A nonempty string is trimmed; other values use the default. Explicit CLI paths override it.                                                                                               |
| `SCHEMA_SPLIT_MANAGEMENT_AUTO_SNAPSHOT`   | `false`               | Enables automatic snapshots for boolean `true`, case-insensitive string `true`, or string `1`. Other values disable it.                                                                                                   |
| `SCHEMA_SPLIT_HARD_EXIT`                  | `true`                | Read from the process environment. Unset, case-insensitive `true`, or `1` exits the CLI process immediately; `false` or `0` sets its exit code and lets it finish naturally. Other supplied values also select soft exit. |

For automatic snapshots:

```dotenv
SCHEMA_SNAPSHOT_ENABLED=true
SCHEMA_SPLIT_MANAGEMENT_SNAPSHOT_FOLDER=/directus/snapshots
SCHEMA_SPLIT_MANAGEMENT_AUTO_SNAPSHOT=true
```

## CLI commands

Run these commands in the configured Directus runtime:

```sh
npx directus schema-split snapshot -o /directus/snapshots
npx directus schema-split apply /directus/snapshots
npx directus schema-split migrate -i /directus/schema.yaml -o /directus/snapshots
```

For [hardened Directus images](https://directus.com/docs/self-hosting/hardened-images), which omit
`npx`, invoke the CLI entrypoint directly:

```sh
docker compose exec directus node /directus/cli.js schema-split snapshot -o /directus/snapshots
docker compose exec directus node /directus/cli.js schema-split apply /directus/snapshots
docker compose exec directus node /directus/cli.js schema-split migrate -i /directus/schema.yaml -o /directus/snapshots
```

The command signatures remain:

```text
schema-split apply [folder]
schema-split snapshot [-o, --output [folder]]
schema-split migrate -i, --input <file> [-o, --output [folder]]
```

Omitting the folder or output option uses the configured default folder. Supplying `-o` or
`--output` without a folder fails.

- `snapshot` reads the current schema, **clears the output directory**, and writes a new split
  snapshot. Use a directory dedicated to schema files.
- `apply` reconstructs the snapshot and calls `SchemaService.diff()` and `SchemaService.apply()`
  with administrator accountability. The diff uses `force: true`, bypassing Directus version/vendor
  compatibility checks. It applies immediately without confirmation or a dry run and can remove
  schema objects absent from the snapshot. Review the snapshot and back up the database first.
- `migrate` converts a monolithic YAML snapshot to the split format without changing the database.
  It writes into the output directory without clearing it; use an empty directory to avoid retaining
  obsolete definitions.

`apply` repeats diff/apply passes until no changes remain, with at most ten unsuccessful passes.
Missing or invalid metadata, malformed recognized YAML files, service errors, and failure to
converge produce a nonzero exit code. Commands normally terminate the process explicitly;
`SCHEMA_SPLIT_HARD_EXIT=false` is useful when debugging open handles.

`apply` uses only the `metadata.yml` directly in the selected snapshot folder. Metadata in
subfolders cannot replace it or change the snapshot root.

The apply hash uses the running Directus version, so forced cross-version diffs retain the host's
concurrency check. Names containing path separators are rejected during snapshot creation or
migration.

## Snapshot format

```text
snapshots/
├── metadata.yml
└── collection_<hash>/
    ├── collection_<hash>.yml
    ├── fields/
    │   └── field_<hash>.yml
    ├── relations/
    │   └── field_<hash>.yml
    └── systemFields/
        └── field_<hash>.yml
```

`metadata.yml` records the snapshot version, Directus version, and database vendor. Collection,
field, relation, and system-field files contain their respective Directus snapshot definitions.
Names use the lowercase original name plus the first eight characters of its case-sensitive
`object-hash` hash; the YAML contents preserve the original names. Keep the generated layout when
editing or moving files.

Each `systemFields` entry is stored under its collection's hashed directory, even when that system
collection has no collection definition in the snapshot. Snapshot creation and migration preserve
these entries, and apply uses them as the desired system-field index state. Full snapshots remove
target system-field indexes whose entries are absent from the snapshot.

### Compatibility with older snapshots

Older split snapshots omitted `systemFields`. Before applying them with this version, regenerate the
snapshot from an authoritative instance with the intended indexes, or migrate a complete native YAML
snapshot containing the intended `systemFields` into an empty directory. Review the generated files
before deployment. A snapshot with no `systemFields` files represents an empty array; apply no
longer preserves the target's current entries and can remove its system-field indexes. Migration
cannot recover index definitions missing from its input.

This bundle manages schema, not collection records, uploads, or a complete database backup.

## Automatic snapshots

When enabled, collection, field, and relation create/update/delete events schedule a snapshot after
a 15-second debounce. The automatic scheduler uses a renewable five-minute filesystem lease and
skips work while `directus-schema-applying.flag` exists in the process temporary directory. Apply
removes that flag on ordinary completion and failure.

## Concurrent operations and interrupted writes

Automatic snapshots, CLI snapshots, migration, and the complete apply operation share an exclusive
filesystem lock at `directus-schema-snapshot/operation.lock` under the process temporary directory.
The lock covers schema capture, all file reads/writes, and every diff/apply pass including the final
convergence check. An overlapping operation fails immediately; CLI commands return a nonzero exit
code and automatic tasks log the failure. Retry after the active operation finishes. The apply flag
suppresses automatic triggers; the exclusive lock also protects work already scheduled or running.

Choose a dedicated snapshot output folder that does not contain the temporary coordination
directory. Writers remove `metadata.yml` before changing definitions and publish it atomically after
all files are written. The output directory itself stays in place, including when mounted into a
container. A failed or cancelled write can leave incomplete files without metadata; apply rejects
them. Recreate the snapshot or rerun migration successfully before applying. This is fail-closed
publication, not a backup of the previous output or a database transaction.

The operation lock has no expiry, so a paused process cannot lose ownership to another operation. A
forcibly killed process can leave `operation.lock` and the apply flag behind. After confirming **all
schema-split operations have stopped**, remove the stale lock directory and flag, then repair any
incomplete snapshot before retrying. Never remove a live owner's lock.

Coordination requires the same filesystem-backed temporary directory in every participating process.
Separate container temporary directories, older bundle versions, external snapshot edits, and schema
changes outside this bundle are not synchronized. For those deployments, run snapshot writing and
apply sequentially with other writers stopped, or provide shared temporary storage. Sharing only the
snapshot folder is insufficient. No distributed or database-wide lock is provided.

If commands are absent, check `SCHEMA_SNAPSHOT_ENABLED` and extension loading. If automatic
snapshots are absent, also check `SCHEMA_SPLIT_MANAGEMENT_AUTO_SNAPSHOT`, filesystem permissions,
and the apply flag. The bundle logs failures through the Directus logger.
