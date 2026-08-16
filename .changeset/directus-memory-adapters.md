---
'@onderwijsin/directus-extension-utils': minor
---

Use `@directus/memory` for Directus cache, KV, Redis lock, and auto-task marker coordination while
retaining explicit filesystem adapters for server deployments. The Redis lock provider now owns its
Redis connection and accepts a Redis URL. Locks, task handlers, task storage, and logger utilities
are server-only exports because they depend on the Directus runtime.
