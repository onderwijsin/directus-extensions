---
'@onderwijsin/directus-schema-snapshot-bundle': minor
---

Persist individual system-field definitions in each collection's hashed `systemFields/` directory
for snapshot creation, native YAML migration, and apply. Apply now uses the saved definitions with
normal full-snapshot removal semantics instead of preserving the target's current system fields.

Before applying older split snapshots that omitted system fields, regenerate them from an
authoritative instance or migrate a complete native snapshot containing the intended definitions.
Missing system-field files represent an empty array and can remove system-field indexes from the
target.
