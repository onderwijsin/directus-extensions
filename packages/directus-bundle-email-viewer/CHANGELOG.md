# @onderwijsin/directus-bundle-email-viewer

## 1.1.5

### Patch Changes

- 22299eb: ✨ Disable automated schema changes
  If you don't want an extension to modify your database schema, you can now disable it. This can either be done globally, or per extension. Beware that if you disbale schema changes, you are responsible for providing the changes yourself. The extensions still rely on certain collections and fields.

  - add disableSchemaChange utility
  - check environment vars for config settings, only trigger schema changes accordingly
  - update readme

- f098d6e: Cleanup field schema for policy collection, to have only necessary field props
- 24e24d1: Add eventContext to services
  If you do not pass the existing db connection to the service it will use the default DB connection which deadlocks the db for sqlite

  Further reference: https://github.com/directus/directus/issues/24798

- Updated dependencies [22299eb]
- Updated dependencies [8413a05]
- Updated dependencies [24e24d1]
- Updated dependencies [563f26e]
  - utils@0.1.3

## 1.1.4

### Patch Changes

- Updated dependencies [143e474]
- Updated dependencies [2d29e2c]
- Updated dependencies [6a21da5]
  - utils@0.1.2

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
