# Changelog

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
