---
'@onderwijsin/directus-extension-utils': patch
---

Register startup lifecycle listeners synchronously only for used phases, preserving Directus's
unregister collection during extension setup. Keep data in the first middleware listener and
documentation in a separate second listener when both are used, regardless of consumer call order.
Additional callbacks reuse existing listeners, and unused phases perform no startup coordination.
The public API, lifecycle events, callback order, gates, locking, and error handling remain unchanged.
