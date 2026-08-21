# Decision: Provide a custom typed `defineHook`

- **Status:** Accepted
- **Date:** 2026-08-21
- **Scope:** Directus API hook entrypoints and `@onderwijsin/directus-extension-utils` public
  runtime subpaths

## Context

Directus's `RegisterFunctions['action']` type currently declares action handlers as returning
`void`. The Directus runtime permits asynchronous action handlers, and our hooks need to await work
such as cache invalidation, redirect updates, and other mutation-side effects when completion is
part of the hook contract. The inaccurate type either rejects valid handlers or encourages each
callsite to suppress the same type/lint problem.

The action metadata type supplied by Directus is also not sufficiently specific for this shared
adapter. The custom boundary therefore needs an explicit `Record<string, any>` escape hatch, with a
narrow, documented lint suppression at that boundary.

The correction must not make every server utility import `@directus/extensions-sdk`. Hook
registration is an entrypoint concern, while caches, policies, locks, and other server utilities
should remain independently importable.

## Decision

The utility package provides a custom `defineHook` from the dedicated
`@onderwijsin/directus-extension-utils/hook` subpath.

Its `RegisterFunctions` type replaces only the `action` member with an `ActionHandler` that may
return either a value or a promise. The custom `defineHook` delegates directly to Directus's native
`defineHook` at runtime; it changes compile-time typing only. The action metadata remains
`Record<string, any>` at this boundary, with a targeted Oxlint suppression because Directus does not
expose a safer metadata type.

API hook entrypoints should use:

```ts
import { defineHook } from '@onderwijsin/directus-extension-utils/hook'

export default defineHook((hook, context) => {
  hook.action('items.articles.update', async () => {
    await invalidateCache(context)
  })
})
```

The `/hook` entrypoint is built and exported separately. Server utilities continue to use the
`/server` subpath and must not import the hook helper merely for its types. The package must not
re-export `defineHook` from the root or `/server`, and app/shared subpaths remain free of Directus
server registration concerns.

The corrected `ActionHandler`, `RegisterFunctions`, and `HookConfig` types are also exported from
the separate `@onderwijsin/directus-extension-utils/types` subpath. This path contains only type
imports from `@directus/types`; it does not import the runtime hook adapter or
`@directus/extensions-sdk`.

Asynchronous action handlers are intended for work whose completion belongs to the action's
contract. Work that is deliberately best-effort or background-oriented may still be explicitly
fire-and-forget, with its rejection handled and logged at the callsite.

## Alternatives considered

- **Use Directus's native `RegisterFunctions` everywhere:** rejected because its `void` return type
  does not represent the supported asynchronous action-handler behavior.
- **Suppress the warning at every asynchronous action callsite:** rejected because it duplicates a
  framework type correction across extensions and makes the intended contract less visible.
- **Augment Directus's types globally:** rejected because it changes the type contract for unrelated
  consumers and depends on an upstream-owned declaration.
- **Export the custom helper from `/server` or the package root:** rejected because it would pull
  the hook's `@directus/extensions-sdk` dependency into consumers that only need server or shared
  utilities.
- **Replace Directus's runtime `defineHook`:** rejected because the runtime registration behavior
  belongs to Directus; this decision is limited to a type-safe adapter.

## Consequences

Hook implementations can await supported asynchronous action handlers without local type
workarounds, and shared hook-registration helpers can accept the corrected registration type. Cache
invalidation and similar side effects can therefore be deterministic when the action contract
requires it.

The package has an additional public `/hook` subpath and retains `@directus/extensions-sdk` as a
runtime dependency for that subpath, plus a type-only `/types` subpath. The separate build entries
prevent the SDK from being included through the `/server` utility bundle or type-only imports.
Consumers must import `defineHook` from `/hook` and import only the types from `/types`.

Awaiting action work can add latency to the originating Directus mutation and can make failures part
of the action's observable behavior. Callers should use fire-and-forget only when that trade-off is
intentional and must handle rejected promises explicitly.

## Reconsideration criteria

Revisit this decision if Directus publishes an accurate asynchronous `ActionHandler` type, changes
the action lifecycle semantics, or the package's bundling/runtime model makes the separate hook
subpath unnecessary.
