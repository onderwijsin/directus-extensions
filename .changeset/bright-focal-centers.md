---
'@onderwijsin/directus-ai-image-metadata-bundle': minor
---

Add two operation options to `ai-image-metadata` and `ai-image-metadata-regenerate`:

- `generateFocalPoint` (default: `false`): generate an approximate crop center in the existing
  shared vision call and write `directus_files.focal_point_x` and `directus_files.focal_point_y`
  together. Complete manual focal points are preserved, and incomplete coordinate pairs are filled
  together.
- `overwriteFocalPoint` (default: `false`): replace complete focal-point pairs when
  `generateFocalPoint` is enabled. The Studio shows this option only when focal-point generation is
  enabled.

For focal-point-only backfills, enable `generateFocalPoint` and disable `generateAltText`,
`generateTags`, and `generateFilename`. With `missingOnly: true`, regeneration selects incomplete
focal-point pairs independently of textual metadata and leaves all text fields untouched. To replace
complete focal points, also set `missingOnly: false` and `overwriteFocalPoint: true`.

Existing saved Flows that omit the new options receive `false` defaults at execution time; no
migration or resaving is required. Focal generation uses Directus PNG conversion for all supported
image formats and maps coordinates using verified original oriented dimensions. Existing text-only
defaults remain unchanged.
