# `@onderwijsin/directus-extension-utils`

Small, reusable utilities for Directus extensions. The package is runtime-portable across Directus
setups, but is intended to run inside Directus—not as a framework-agnostic utility library.

The public surface includes:

- runtime guards, attempt/retry helpers, object helpers, MIME classification, and UUIDs;
- server-only locks, debounced auto-task handlers, task storage, logging, and extension setup
  helpers; and
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

Use `/sentry` when an extension explicitly needs the Sentry helpers. This separate entry point keeps
Sentry out of consumers that only import `/server` utilities:

```ts
import { captureException } from '@onderwijsin/directus-extension-utils/sentry'
```

The shared Directus extension build configuration is available as an unbundled package subpath:

```js
import config, {
  createExtensionConfig,
} from '@onderwijsin/directus-extension-utils/extension.config.js'

export default createExtensionConfig({ externals: ['oxfmt'] })
// Or: export default config
```

Use `/constants` for shared deployment-environment values:

```ts
import { DEPLOYMENT_ENV, deploymentEnvs } from '@onderwijsin/directus-extension-utils/constants'

const environment: DEPLOYMENT_ENV = 'development'
console.log(deploymentEnvs, environment)
```

`deploymentEnvs` is the readonly tuple `['development', 'staging', 'production']`, and
`DEPLOYMENT_ENV` is its corresponding TypeScript union.

Create a logger from a Pino-compatible runtime logger, or use the console-backed fallback:

```ts
import { createLogger } from '@onderwijsin/directus-extension-utils/server'

const logger = createLogger(context.logger)
logger.info('Extension started', { extension: 'orders' })
```

When a logger is provided, it is returned unchanged. Without one, the fallback exposes the same
`info`, `warn`, `error`, `debug`, and `trace` methods and forwards messages plus optional fields to
the corresponding console methods.

The `/app` and `/shared` entry points expose the common browser-safe surface. Do not import locks,
tasks, task storage, logging, or setup helpers from those paths.

Use `/server` setup helpers at an API extension boundary:

```ts
import {
  extensionSetup,
  validateExtensionOptions,
} from '@onderwijsin/directus-extension-utils/server'
import { envSchema } from './env.schema'

const setup = extensionSetup('my-extension', env, logger)
setup.start()
if (!setup.isEnabled()) return
const options = validateExtensionOptions(env, envSchema, logger)
// Register routes or other API behavior using options.
setup.end()
```

`extensionSetup` logs lifecycle messages and supports an environment-based enabled flag.
`validateExtensionOptions` parses a complete extension environment with Zod, logs validation
details, and throws when the configuration is invalid.

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
