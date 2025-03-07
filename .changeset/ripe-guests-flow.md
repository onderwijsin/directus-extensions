---
"@onderwijsin/directus-extension-cache-flush": major
---

✨ Add cache flush extension
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
