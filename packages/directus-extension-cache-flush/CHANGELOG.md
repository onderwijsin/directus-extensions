# @onderwijsin/directus-extension-cache-flush

## 1.2.0

### Minor Changes

- 0fd6c19: Update dependencies

### Patch Changes

- Updated dependencies [0fd6c19]
  - utils@0.3.0

## 1.1.0

### Minor Changes

- 04116e2: ## Implementation of ESLint

  ### Overview

  We have implemented ESLint in the project to ensure code quality and consistency. The implementation follows the standards set by `@directus/eslint-config` and was guided by the Directus Labs extensions monorepo.

  ### Configuration

  The ESLint configuration is based on `@directus/eslint-config` with some custom overrides to better fit our project's needs. These overrides are specified in `eslint.config.mjs`.

  ### Steps Taken

  1. **Installation**: Installed ESLint and the `@directus/eslint-config` package.
  2. **Configuration**: Created and customized the `eslint.config.mjs` file to include necessary overrides.
  3. **Integration**: Integrated ESLint into the project's build and CI processes to ensure continuous code quality checks.
  4. **Linting**: Ran ESLint across the entire codebase and fixed all identified linting errors.
  5. **Update docs**: added info on eslint to README.md and CONTRIBUTING.md

  ### Benefits

  - **Consistency**: Ensures consistent coding styles across the project.
  - **Quality**: Helps in identifying and fixing potential issues early in the development process.
  - **Maintainability**: Makes the codebase easier to maintain and understand.

### Patch Changes

- 90e3016: Use zod for schema validation in cache-flush and data-sync. Validates the schema's provided in the config collections, and logs any errors
- Updated dependencies [04116e2]
  - utils@0.2.0

## 1.0.2

### Patch Changes

- ce28185: Schema validation now returns a boolean to indicate whether the schema is valid. It also logs each individual error with Directus' logger

## 1.0.1

### Patch Changes

- 5fecd5f: Refactor code
  Remove redunacy and split functions into seperate components that handle one single thing. Add types to utils for Filter and Action hooks
- 55dbe8b: BREAKING! Make payload an array to minimize the nmbr of calls needed on updates and delete. Check reame for the new payload type
- b27e444: Add pruneObjByFieldKeys to utils
  Add a reusable utility fn to workspace utils. Implements it in data sync and cache flush
- Updated dependencies [5fecd5f]
- Updated dependencies [b27e444]
  - utils@0.1.4

## 1.0.0

### Major Changes

- 8fadc0c: ✨ Add cache flush extension
  Adds a new extension to flush cache in front end applications. The extension sends requests based on the provided config to an unlimited number of target apps.

  - Add automated schema modification: create cache_flush_targets and cache_flush_targets_directus_users collections
  - Add fields to collection necessary for configuration
  - add utility functions to read and parse config
  - add utility to fetch existing data to populate payload
  - Add event filter logic
  - Add flush call logic
  - implement error notifications
  - Add readme
  - Add types
  - Update lock file

### Patch Changes

- 563f26e: Fix items services in sqlite by proving existing DB connextion (attempt 2)
- Updated dependencies [22299eb]
- Updated dependencies [8413a05]
- Updated dependencies [24e24d1]
- Updated dependencies [563f26e]
  - utils@0.1.3
