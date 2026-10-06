---
'@onderwijsin/directus-extension-utils': patch
---

Register startup lifecycle listeners only for phases with synchronously registered callbacks. Batch
listener registration in a microtask to preserve canonical schema, data, documentation order
regardless of consumer call order. Additional callbacks reuse their phase's listener, and unused
phases perform no startup coordination. The public API, separate data and documentation listeners,
lifecycle events, callback order, gates, locking, and error handling remain unchanged.
