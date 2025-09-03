# @onderwijsin/directus-extension-data-sync

## 1.4.1

### Patch Changes

- b71b74f: Fix dependency issues

## 1.4.0

### Minor Changes

- 96ed424: # Update dependencies and fix async hook registration
  - All workspace dependencies have been updated to the latest versions. Any issues resulting from this update (mainly zod, and Directus typings) have been fixed.
  - All tsconfig files in the workspace have been updated. Deprecated moduleResolution `node` has been dropped in favor of `bundler`. The `target`, `lib` and `module` props have been updated accordingly.
  - Lastly, all hooks that had async registration handlers have been refactored. Any asynchronous code that was part of the registration, has been moved to a `cli.after` hook. Async hook registration is not supported, and leads to hooks not being available when you except them to be (because they are still being loaded in the background). Effectively, this should not impact users of the extensions, unless you want to use these extensions in `cli.before` (which you shouldn't want). The asynchronous code is mostly related to schema changes

### Patch Changes

- Updated dependencies [96ed424]
  - utils@0.4.0

## 1.3.0

### Minor Changes

- 0fd6c19: Update dependencies

### Patch Changes

- Updated dependencies [0fd6c19]
  - utils@0.3.0

## 1.2.0

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

## 1.1.2

### Patch Changes

- ce28185: Schema validation now returns a boolean to indicate whether the schema is valid. It also logs each individual error with Directus' logger

## 1.1.1

### Patch Changes

- 5fecd5f: Refactor code
  Remove redunacy and split functions into seperate components that handle one single thing. Add types to utils for Filter and Action hooks
- b27e444: Add pruneObjByFieldKeys to utils
  Add a reusable utility fn to workspace utils. Implements it in data sync and cache flush
- Updated dependencies [5fecd5f]
- Updated dependencies [b27e444]
  - utils@0.1.4

## 1.1.0

### Minor Changes

- 6c1b2be: BREAKING!: update the collection name that is used for storing remote sources
  Both the remote sources collection and it's junction to directus_users have a new name: data_sync_remote_sources. This is done so that the collection name directly refers to the extension.
  If you already have the remote_data_sources and remote_data_source_directus_users collections in your system, you need to manually remove them after migrating you data to the new collection

### Patch Changes

- 22299eb: ✨ Disable automated schema changes
  If you don't want an extension to modify your database schema, you can now disable it. This can either be done globally, or per extension. Beware that if you disbale schema changes, you are responsible for providing the changes yourself. The extensions still rely on certain collections and fields.

  - add disableSchemaChange utility
  - check environment vars for config settings, only trigger schema changes accordingly
  - update readme

- 504dcf9: Implement new createNotification utility
- 24e24d1: Add eventContext to services
  If you do not pass the existing db connection to the service it will use the default DB connection which deadlocks the db for sqlite

  Further reference: https://github.com/directus/directus/issues/24798

- 2b40e14: Update readme with config options
- b90facf: Cleanup schema to only use props supported by all db providers
- 563f26e: Fix items services in sqlite by proving existing DB connextion (attempt 2)
- Updated dependencies [22299eb]
- Updated dependencies [8413a05]
- Updated dependencies [24e24d1]
- Updated dependencies [563f26e]
  - utils@0.1.3

## 1.0.0

### Major Changes

- 2d29e2c: feat(data-sync): add config of remote sources to data studio - create remote_data_sources collection and fields - create junction to directus_users - auto configure relationships - implement fetchRemotes utlity function - add typing for remote sources - remove local config for remote sources - add schema for collections, fields and relations
- 6a21da5: Add data-sync extension

  - add directus network docker compose to project root. This creates three directus instances, three postgress DBs and a network for them to communicate
  - add new project utility: checkIfItemExists()
  - add data schemas for policy, user and access (juction between user and policy)
  - add data sync function for each event
  - add notitication function for failed syncs
  - add util functions
  - add types
  - add readme
  - update project readme
  - update lockfile

### Patch Changes

- Updated dependencies [143e474]
- Updated dependencies [2d29e2c]
- Updated dependencies [6a21da5]
  - utils@0.1.2
