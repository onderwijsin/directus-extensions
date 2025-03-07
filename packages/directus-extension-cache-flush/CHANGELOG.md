# @onderwijsin/directus-extension-cache-flush

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
