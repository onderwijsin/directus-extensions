# @onderwijsin/directus-extension-cache-flush

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
