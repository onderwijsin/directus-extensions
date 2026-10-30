# Changelog

## 0.3.0

### Minor Changes

- ca4fafb: Add two operation options to `ai-image-metadata` and `ai-image-metadata-regenerate`:

  - `generateFocalPoint` (default: `false`): generate an approximate crop center in the existing
    shared vision call and write `directus_files.focal_point_x` and `directus_files.focal_point_y`
    together. Complete manual focal points are preserved, and incomplete coordinate pairs are filled
    together.
  - `overwriteFocalPoint` (default: `false`): replace complete focal-point pairs when
    `generateFocalPoint` is enabled. The Studio shows this option only when focal-point generation
    is enabled.

  For focal-point-only backfills, enable `generateFocalPoint` and disable `generateAltText`,
  `generateTags`, and `generateFilename`. With `missingOnly: true`, regeneration selects incomplete
  focal-point pairs independently of textual metadata and leaves all text fields untouched. To
  replace complete focal points, also set `missingOnly: false` and `overwriteFocalPoint: true`.

  Existing saved Flows that omit the new options receive `false` defaults at execution time; no
  migration or resaving is required. Focal generation uses Directus PNG conversion for all supported
  image formats and maps coordinates using verified original oriented dimensions. Existing text-only
  defaults remain unchanged.

- e18ec16: Prepare provider images conditionally: retain acceptable JPEG/PNG/WebP bytes, resize long
  edges above the configured maximum (default 1500 px) toward the configured target (default 800
  px), and use WebP quality 80 for byte-size preparation, AVIF/TIFF conversion, and focal-point
  canonicalization. Small images remain at native resolution.

  Configure each operation with `maxImageSizeBytes` (default 500,000 bytes), `maxImageDimension`
  (default 1500 px), and `targetImageDimension` (default 800 px). All three appear in Studio and run
  summaries. The resize bound is the smaller of the requested target and maximum dimension; no
  resizing is requested for acceptable dimensions. The former `targetImageSizeBytes` remains
  accepted in saved Flows as a fallback, with the current option taking precedence. Rename size
  diagnostics to `imageMaxSizeExceeded`, `summary.assetsOverMaxSize`, and
  `AI_METADATA_IMAGE_MAX_SIZE_EXCEEDED` to distinguish byte size from dimensions.

  Use the configured soft byte-size threshold (default 500,000 bytes): make at most one
  transformation attempt, then submit larger outputs with an `AI_METADATA_IMAGE_MAX_SIZE_EXCEEDED`
  warning, per-file `imageMaxSizeExceeded` flag, and `summary.assetsOverMaxSize` count. Existing
  hard byte limits and provider retries are unchanged.

  Validate preparation dimensions and filesize metadata. Verify canonical WebP dimensions after
  proportional resizing while mapping normalized focal points to the original oriented image.

  Expose preparation reasons and source/output sizing in per-file `imagePreparation` diagnostics and
  INFO preparation logs. Completion summaries include `transformsByReason`, with independent counts
  for filetype, dimensions, filesize, unknown filesize, and focal-point orientation. Retain these
  observations when transformation or subsequent provider processing fails.

### Patch Changes

- ca4fafb: Send image bytes using the AI SDK's supported `file` content part with the explicit image
  MIME type, removing the deprecated `image` content-part warning while preserving private image
  transport across providers.

## 0.2.1

### Patch Changes

- 2da6872: Capture bounded upstream failure details, provider output, and Zod validation diagnostics
  in failed-file results and single-file processing rejections.
- 2da6872: Filter both image metadata folder selectors to file folders, excluding Flow folders.
- 2da6872: Include validated upload-operation options and the explicit root-folder selection policy
  in run summaries.

## 0.2.0

### Minor Changes

- f843e3f: Select only JPEG, PNG, WebP, TIFF and AVIF files through fixed reader filters, ignoring
  retired saved MIME options. Unsupported images and non-images are excluded before processing.
  Preserve folder, overwrite, missing-only, accountability, cursor and maxFiles contracts.

  Preserve original JPEG, PNG and WebP provider inputs. Normalize only AVIF and TIFF to PNG through
  accountable Directus AssetsService transformations and Directus-managed derivative caching. Bound
  provider-input bytes and report safe per-file conversion failures without changing stored source
  files or adding native dependencies.

- 7a62322: Expose transformation status, original MIME type and elapsed conversion duration on each
  file result. Add transformed-asset counts and counts by original MIME to run summaries, including
  a summary for explicit-file operations. Retain completed conversion diagnostics when later
  provider or write work fails, and document cached derivatives and failed-attempt timing semantics.
- 436f8bb: Add an independent Generate Alt Text control, enabled by default, alongside generation
  and overwrite controls for tags and filename. Disabled properties are not requested or written,
  and disabling all generation skips provider calls.
- e3864ef: Add validated regeneration concurrency from 1 to 100, defaulting to sequential
  processing. Continuously refill free slots across query pages, retain selection-order results, and
  settle active jobs before fatal rejection.
- 7849361: Replace folder JSON editors in both image metadata operations with searchable Directus
  folder drawers and a single Include Root Folder control. Folder options now require selection
  objects; old UUID and null/root selections require reconfiguration. Root files are excluded unless
  Include Root Folder is enabled. Validate and deduplicate selections before execution.
- e3864ef: Select missing metadata before the candidate limit, self-advance repeat backfills, and
  expose stable ID continuation and explicit failure exclusions. Bound whitespace/tag refinement in
  ID order and replace numeric offsets with afterId/nextCursor and remaining. Expose settled results
  and the original restart boundary on fatal regeneration failures.

### Patch Changes

- cd738d2: Return sanitized, correlated regeneration summaries and timed per-file diagnostics.
  Isolate multi-file failures while preserving single-file Flow rejection, and bound asset
  acquisition by the image-processing deadline.

## 0.1.0

### Minor Changes

- c46390a: Add image metadata and resumable backfill Flow operations with private asset access,
  shared AI configuration, accessible descriptions, optional tags and filenames, and preservation of
  existing metadata by default, global and per-operation metadata language selection, and separate
  overwrite controls for alt text, tags, and download filenames. Hide optional overwrite controls
  until their generation options are enabled and share conservative vision-model image MIME defaults
  between validation and Studio.

  Report actionable, credential-safe provider configuration failures for both operations.

### Patch Changes

- 7f17594: Request and validate tags and filenames only when their generation options are enabled.
  Ignore malformed unused fields in alt-text-only responses.
- 7f17594: Treat blank optional shared AI environment keys as unset so local and E2E Compose can
  start without live credentials. Resolved provider configurations still require a nonblank key.
- 7f17594: Restrict AI model, credential, and base URL inheritance to matching provider layers.
  Provider overrides no longer send lower-layer credentials to a different provider, and Markdown
  Editor configuration follows the same provider-bound resolution.
- Updated dependencies [7f17594]
- Updated dependencies [7f17594]
  - @onderwijsin/directus-extension-utils@0.6.2

## 0.0.1

Initial image metadata Flow operations.
