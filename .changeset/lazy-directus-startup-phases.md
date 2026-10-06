---
'@onderwijsin/directus-extension-utils': patch
'@onderwijsin/directus-magic-links-bundle': patch
'@onderwijsin/directus-loops-bundle': patch
'@onderwijsin/directus-markdown-editor-bundle': patch
'@onderwijsin/directus-studio-docs-bundle': patch
'@onderwijsin/directus-coolify-deployments-bundle': patch
'@onderwijsin/directus-sluggernaut-bundle': patch
---

Register startup lifecycle listeners synchronously only for phases that are both used and enabled,
preserving Directus's unregister collection during extension setup. Keep data in the first middleware
listener and documentation in a separate second listener when both are used, regardless of consumer
call order.
Additional callbacks reuse existing listeners, and unused or disabled phases perform no startup
coordination. Disabled schema/data callbacks are not stored; their existing disabled-phase messages
are logged once per phase during registration. Documentation still bypasses the ordinary startup
switches. The public API, lifecycle events, callback order, locking, and error handling remain
unchanged. Execution-time gates remain defensive checks for registered callbacks.

Rebuild the affected Directus extension bundles with the updated startup coordinator. The coordinator
is bundled into their published artifacts, so releasing extension-utils alone would not update
already-published bundles.
