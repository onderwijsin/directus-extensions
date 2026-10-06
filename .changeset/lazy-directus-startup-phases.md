---
'@onderwijsin/directus-extension-utils': patch
'@onderwijsin/directus-magic-links-bundle': patch
'@onderwijsin/directus-loops-bundle': patch
'@onderwijsin/directus-markdown-editor-bundle': patch
'@onderwijsin/directus-studio-docs-bundle': patch
'@onderwijsin/directus-coolify-deployments-bundle': patch
'@onderwijsin/directus-sluggernaut-bundle': patch
---

Register startup lifecycle listeners synchronously only for used phases, preserving Directus's
unregister collection during extension setup. Keep data in the first middleware listener and
documentation in a separate second listener when both are used, regardless of consumer call order.
Additional callbacks reuse existing listeners, and unused phases perform no startup coordination.
The public API, lifecycle events, callback order, gates, locking, and error handling remain unchanged.

Rebuild the affected Directus extension bundles with the updated startup coordinator. The coordinator
is bundled into their published artifacts, so releasing extension-utils alone would not update
already-published bundles.
