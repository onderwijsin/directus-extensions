# utils

## 0.2.0

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

## 0.1.4

### Patch Changes

- 5fecd5f: Refactor code
  Remove redunacy and split functions into seperate components that handle one single thing. Add types to utils for Filter and Action hooks
- b27e444: Add pruneObjByFieldKeys to utils
  Add a reusable utility fn to workspace utils. Implements it in data sync and cache flush

## 0.1.3

### Patch Changes

- 22299eb: ✨ Disable automated schema changes
  If you don't want an extension to modify your database schema, you can now disable it. This can either be done globally, or per extension. Beware that if you disbale schema changes, you are responsible for providing the changes yourself. The extensions still rely on certain collections and fields.

  - add disableSchemaChange utility
  - check environment vars for config settings, only trigger schema changes accordingly
  - update readme

- 8413a05: Add createNotification function, which is a utility for the notifications service which defaults applied
- 24e24d1: Add eventContext to services
  If you do not pass the existing db connection to the service it will use the default DB connection which deadlocks the db for sqlite

  Further reference: https://github.com/directus/directus/issues/24798

- 563f26e: Fix items services in sqlite by proving existing DB connextion (attempt 2)

## 0.1.2

### Patch Changes

- 143e474: Different database providers, have different ways of declaring field schema.
  This causes the field and relation config checker to throw (unnecesary) errors.
  Implemented some additional checks, but far from perfect.

  Created a new issue to track progress on this point

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

## 0.1.1

### Patch Changes

- 8997b45: Add paralel dev for all packages

  - remove build files from utils
  - remove scripts from utils

- 42d136a: - Adds a new util fn the project utils named cacheProvider
  - Refactor all cache usage in email-viewer to utilize cacheProvider. This fixes circular imports
  - add cacheConfig settings to email-viewer
  - add clear button to search input
  - add debounce to search input

## 0.1.0

### Minor Changes

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
