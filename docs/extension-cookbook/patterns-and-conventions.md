# Patterns and conventions

This article records observations, not settled architecture. Promote a pattern to a repository
contract only after it has been used successfully by more than one extension or package.

When choosing a pattern, prefer correctness, a small change, existing evidence, readability, type
safety, and performance in that order. Record Directus-specific assumptions with links to official
documentation or MCP evidence. Do not copy concepts from another framework into Directus extensions
without an equivalent Directus contract.

## Cache and KV

Cache and KV are Directus runtime concerns. Use `@directus/memory` directly; extension utilities do
not add another cache abstraction.

Use `createCache` for disposable derived values. A cache miss is normal because the value can be
rebuilt:

```ts
import { createCache } from '@directus/memory'

const cache = createCache({
  type: 'local',
  namespace: 'orders:derived',
})

await cache.set('summary:42', { total: 3 }, 60_000)
const summary = await cache.get('summary:42')
```

Use `createKv` for coordination state, such as markers or a last-processed value:

```ts
import { createKv } from '@directus/memory'

const kv = createKv({
  type: 'local',
  namespace: 'orders:coordination',
})

await kv.set('last-sync', new Date().toISOString())
const lastSync = await kv.get('last-sync')
```

For multiple Directus replicas, configure both providers for Redis and use stable,
extension-specific namespaces:

```ts
const sharedCache = createCache({
  type: 'redis',
  namespace: 'orders:derived',
  redis,
})

const sharedKv = createKv({
  type: 'redis',
  namespace: 'orders:coordination',
  redis,
})
```

Both providers come from `@directus/memory`. Use KV for state that coordinates work and cache for
values that are safe to discard and recompute.
