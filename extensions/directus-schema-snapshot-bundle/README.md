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
a 15-second debounce. Automatic snapshots use a filesystem lock with a five-minute lease and skip
work while `directus-schema-applying.flag` exists in the process temporary directory. The apply
command removes that flag on ordinary completion and failure. Coordination files are stored in
`directus-schema-snapshot` under the process temporary directory; the execution lease is renewed
while a snapshot runs.

Filesystem locks and the apply flag coordinate only processes sharing their storage. They do not
provide coordination across containers with separate temporary directories. Use one snapshot writer
for such deployments. A forcibly killed apply process can leave the flag behind; confirm that no
apply is running before removing it.

If commands are absent, check `SCHEMA_SNAPSHOT_ENABLED` and extension loading. If automatic
snapshots are absent, also check `SCHEMA_SPLIT_MANAGEMENT_AUTO_SNAPSHOT`, filesystem permissions,
and the apply flag. The bundle logs failures through the Directus logger.
