---
"@onderwijsin/directus-bundle-email-viewer": patch
"utils": patch
---

- Adds a new util fn the project utils named cacheProvider
- Refactor all cache usage in email-viewer to utilize cacheProvider. This fixes circular imports
- add cacheConfig settings to email-viewer
- add clear button to search input
- add debounce to search input
