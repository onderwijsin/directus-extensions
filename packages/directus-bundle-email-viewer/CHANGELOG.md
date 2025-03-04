# @onderwijsin/directus-bundle-email-viewer

## 1.1.3

### Patch Changes

- 42d136a: - Adds a new util fn the project utils named cacheProvider
  - Refactor all cache usage in email-viewer to utilize cacheProvider. This fixes circular imports
  - add cacheConfig settings to email-viewer
  - add clear button to search input
  - add debounce to search input
- Updated dependencies [8997b45]
- Updated dependencies [42d136a]
  - utils@0.1.1

## 1.1.2

### Patch Changes

- e6ba09f: Fix html markup of notice component in EmailListOptions
- 9356134: feat(utils): implement shared utils

  - add utils folder
  - add tsconfig
  - add utils to pnpm workspace
  - add directus related deps to utils
  - Install utils in sluggernaut and email viewer
  - Add helpers to utils
  - Add schema change functions to utils
  - Refactor sluggernaut and email-viewer to use shared utils
  - Add custom Request type to email-viewer
  - Fix return paths in email-viewer API routes
  - Update lock file

- 0a36073: Code cleanup and refactor

  - update docs and add gifs
  - (email-viewer) refactor providers and cache
  - (email-viewer) fix return values in api routes
  - (email-viewer) add debounce to loading state
  - (sluggernaut) code cleanup

- Updated dependencies [9356134]
  - utils@0.1.0

## 1.1.1

### Patch Changes

- 2cdfe49: Fix email permission helpers by checking for null value of custom_addresses

## 1.1.0

### Minor Changes

- 33d80ed: Implement permission based auth for email-viewer endpoints

## 1.0.1

### Patch Changes

- 2f7d554: Update extension readme and provider readme

## 1.0.0

### Major Changes

- 62adcf4: First release of @onderwijsin/directus-bundle-email-viewer
