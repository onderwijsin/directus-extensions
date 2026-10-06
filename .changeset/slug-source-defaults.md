---
"@onderwijsin/directus-sluggernaut-bundle": patch
---

Resolve omitted slug source fields from literal scalar defaults on create so dependent permalink templates use the final derived slug. Preserve explicit nulls and existing update/recalculation semantics.
