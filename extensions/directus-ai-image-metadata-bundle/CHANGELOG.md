# Changelog

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
