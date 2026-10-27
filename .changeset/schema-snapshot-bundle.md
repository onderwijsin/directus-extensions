---
'@onderwijsin/directus-schema-snapshot-bundle': major
---

Initial release of the Directus schema snapshot bundle.

Create split YAML schema snapshots for version control, apply them through the Directus CLI,
migrate native YAML snapshots, and optionally capture schema changes automatically. Include
collection, field, relation, and system-field definitions, and support disabling the bundle with
`SCHEMA_SNAPSHOT_ENABLED`.

Validate snapshot input and root metadata, report unsuccessful schema convergence, and serialize
snapshot creation, migration, and application across processes sharing temporary storage. Publish
metadata only after all definitions are written so incomplete snapshots cannot be applied.
