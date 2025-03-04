# utils

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
