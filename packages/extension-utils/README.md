# `@onderwijsin/directus-extension-utils`

Small, reusable utilities for Directus extensions. The package is runtime-portable across Directus
setups, but is intended to run inside Directus—not as a framework-agnostic utility library.

The public surface includes:

- runtime guards, attempt/retry helpers, object helpers, MIME classification, and UUIDs;
- server-only locks, debounced auto-task handlers, task storage, and logging; and
- reusable Directus extension types.

## Install

```sh
pnpm add @onderwijsin/directus-extension-utils
```

## Import

Use the root entry point for common helpers:

```ts
import { isRecord, uuid } from '@onderwijsin/directus-extension-utils'
```

Use `/server` for server-only utilities:

```ts
import {
  createAutoTaskHandler,
  createRedisTaskHandlerStorage,
  createRedisLockProvider,
} from '@onderwijsin/directus-extension-utils/server'
```

The `/app` and `/shared` entry points expose the common browser-safe surface. Do not import locks,
tasks, task storage, or logging from those paths.

## Documentation

Start with the [extension-utils cookbook article](../../docs/extension-cookbook/extension-utils.md)
for usage examples and the
[utility glossary](../../docs/extension-cookbook/extension-utils-glossary.md) for coordination
terminology. Maintainers can use the
[API reference](../../.agents/skills/directus-extension-utils/references/api-reference.md) for the
complete export and option surface.
