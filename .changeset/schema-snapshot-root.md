---
'@onderwijsin/directus-schema-snapshot-bundle': patch
---

Use the selected snapshot folder as the apply root instead of inferring it from the first file.
Nested metadata cannot change the snapshot root or substitute for missing root metadata, avoiding
an unintended empty schema.
