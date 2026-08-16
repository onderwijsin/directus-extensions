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

All lock providers use the same `tryAcquire`/lease contract and `defaultLeaseMs` option. Choose the
memory provider for one process, the filesystem provider for processes sharing a directory, or the
Redis provider for shared coordination across replicas.

Auto-task handlers clear a marker only after the task succeeds. Task failures and lost leases are
reported through `onError` and leave the marker pending for a later trigger; failed tasks are not
automatically retried. Tasks should honor the supplied `AbortSignal` and be safe to run again.

## Documentation

Start with the
[extension-utils cookbook article](https://github.com/onderwijsin/directus-extensions/blob/main/docs/extension-cookbook/extension-utils.md)
for usage examples and the
[utility glossary](https://github.com/onderwijsin/directus-extensions/blob/main/docs/extension-cookbook/extension-utils-glossary.md)
for coordination terminology. Maintainers can use the
[API reference](https://github.com/onderwijsin/directus-extensions/blob/main/.agents/skills/directus-extension-utils/references/api-reference.md)
for the complete export and option surface.
