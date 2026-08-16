---
'@onderwijsin/directus-extension-utils': minor
---

Use `@directus/memory` for Directus cache, KV, Redis lock, and auto-task marker coordination while
retaining explicit filesystem adapters for server deployments. The Redis lock provider now owns its
Redis connection and accepts a Redis URL.
