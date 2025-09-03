# @onderwijsin/directus-bundle-email-viewer

## 1.5.0

### Minor Changes

- 96ed424: # Update dependencies and fix async hook registration
  - All workspace dependencies have been updated to the latest versions. Any issues resulting from this update (mainly zod, and Directus typings) have been fixed.
  - All tsconfig files in the workspace have been updated. Deprecated moduleResolution `node` has been dropped in favor of `bundler`. The `target`, `lib` and `module` props have been updated accordingly.
  - Lastly, all hooks that had async registration handlers have been refactored. Any asynchronous code that was part of the registration, has been moved to a `cli.after` hook. Async hook registration is not supported, and leads to hooks not being available when you except them to be (because they are still being loaded in the background). Effectively, this should not impact users of the extensions, unless you want to use these extensions in `cli.before` (which you shouldn't want). The asynchronous code is mostly related to schema changes

### Patch Changes

- Updated dependencies [96ed424]
  - utils@0.4.0

## 1.4.0

### Minor Changes

- 0fd6c19: Update dependencies

### Patch Changes

- Updated dependencies [0fd6c19]
  - utils@0.3.0

## 1.3.0

### Minor Changes

- 4363c2a: ## ✨ Implement email threads
  It is now possible to view entire emial threads, right in Directus. You need to configure this option globally through the Settings panel.

  The email HTML string is sanitized using DOMPurify to prevent XSS attacks.

  The email veiwer is rudimentary, and relies on the styles from the email itself. Further configuration is needed for a full blown (and styling) email renderer

- a6c668d: ## ⚠️ BREAKING: Introduction of Tag filters (and more)
  It's now possible to add both global and user bound tag (or category filters). Any emails that are labeled with this tag, are not visible to any user.

  And also:

  - Introduction of "view email body" permission: this is a global settings that determines if it possible to view the entore email, or just it's preview text

### Patch Changes

- 161814d: Remove old @azure/msal-node dep
- 715ca42: Fix missing shared inboxes by not filtering users for active plans, since not every inbox has a plan. Irrelevant inboxes can still be filtered by global email exclusion

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

- 9613e1e: Add globally excluded email adresses, and minor UI improvements
- 70d2c95: Fix (faulty) cache config that cache responses without regard for permissions
- Updated dependencies [04116e2]
  - utils@0.2.0

## 1.1.6

### Patch Changes

- 419ec28: Only check permission for /email-viewer endpoints
- Updated dependencies [5fecd5f]
- Updated dependencies [b27e444]
  - utils@0.1.4

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
