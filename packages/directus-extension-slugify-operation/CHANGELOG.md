# @onderwijsin/directus-extension-slugify-operation

## 1.3.0

### Minor Changes

- 96ed424: # Update dependencies and fix async hook registration
  - All workspace dependencies have been updated to the latest versions. Any issues resulting from this update (mainly zod, and Directus typings) have been fixed.
  - All tsconfig files in the workspace have been updated. Deprecated moduleResolution `node` has been dropped in favor of `bundler`. The `target`, `lib` and `module` props have been updated accordingly.
  - Lastly, all hooks that had async registration handlers have been refactored. Any asynchronous code that was part of the registration, has been moved to a `cli.after` hook. Async hook registration is not supported, and leads to hooks not being available when you except them to be (because they are still being loaded in the background). Effectively, this should not impact users of the extensions, unless you want to use these extensions in `cli.before` (which you shouldn't want). The asynchronous code is mostly related to schema changes

## 1.2.0

### Minor Changes

- 0fd6c19: Update dependencies

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

## 1.0.1

### Patch Changes

- 24e24d1: Add eventContext to services
  If you do not pass the existing db connection to the service it will use the default DB connection which deadlocks the db for sqlite

  Further reference: https://github.com/directus/directus/issues/24798

## 1.0.0

### Major Changes

- b7b8e36: Initial release of `@onderwijsin/directus-extension-slugify-operation` and `@onderwijsin/directus-bundle-sluggernaut`
