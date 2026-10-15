---
'@onderwijsin/directus-schema-snapshot-bundle': patch
---

Preserve the target instance's system-field indexes when applying split schema snapshots on Directus
12. Keep the existing split YAML format and refresh system fields from the current snapshot on every
diff pass, including the final convergence check.
