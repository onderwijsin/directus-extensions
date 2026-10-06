---
'@onderwijsin/directus-sluggernaut-bundle': minor
---

Replace pre-production prefix/slug permalink generation with scalar field path templates, ordered
variable transformations, and dependency-driven updates. Use Directus' field-template editor,
render against final derived slug values, and preserve path validation and canonical redirect
history. Missing or unmapped dependencies produce null paths.

Existing permalink configurations must replace generateFromSlug, slugField, prefix, and
updateOnSlugChange with generateFromTemplate, pathTemplate, and updateOnDependencyChange.
validatePrefixOnManualInput is removed; explicit manual paths retain normal path validation.
