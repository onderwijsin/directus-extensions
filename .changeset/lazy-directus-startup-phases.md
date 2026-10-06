---
'@onderwijsin/directus-extension-utils': patch
---

Register startup lifecycle listeners only when the first schema, data, or documentation callback is
added. Additional callbacks reuse their phase's listener, and unused phases perform no startup
coordination. The public API, lifecycle events, callback order, gates, locking, and error handling
remain unchanged.
