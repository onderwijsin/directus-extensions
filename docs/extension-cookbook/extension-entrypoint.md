# Extension entrypoints

The declared `directus:extension` metadata and official Directus scaffold are authoritative. Do not
normalize every extension to one layout.

- endpoints, hooks, and themes use a focused `src/index.ts` entrypoint;
- app extensions register from `src/index.ts` and provide the matching component when required;
- operations keep their app and API entrypoints separate; and
- bundles keep independently typed entries under `src/<entry>/` and synchronize their metadata.

Keep registration and orchestration at the entrypoint. For example, a hook entrypoint should keep
the Directus registration visible while delegating domain work:

```ts
import { defineHook } from '@directus/extensions-sdk'

import { rebuildSearchIndex } from './services/search-index'

export default defineHook(({ action }) => {
  action('items.create', (meta) => {
    void rebuildSearchIndex(meta.collection, meta.key)
  })
})
```

## Setup and configuration validation

Server and API entrypoints with environment-backed configuration should validate their options at
the entrypoint boundary. Use the shared setup lifecycle, keep the schema in the entrypoint's sibling
`src/env.schema.ts`, and validate only after the extension has been enabled. See
[Environment validation](environment-validation.md) for the complete pattern, including Directus's
environment type casting and nesting behavior.

```ts
import { defineEndpoint } from '@directus/extensions-sdk'
import {
  extensionSetup,
  validateExtensionOptions,
} from '@onderwijsin/directus-extension-utils/server'
import { envSchema } from './env.schema'

const EXTENSION_NAME = 'catalog'

export default defineEndpoint((router, { env, logger }) => {
  const setup = extensionSetup(EXTENSION_NAME, env, logger)
  setup.start()

  if (!setup.isEnabled()) return

  const options = validateExtensionOptions(env, envSchema, logger)
  router.get('/health', (_request, response) => response.json({ url: options.CATALOG_URL }))

  setup.end()
})
```

Keep external SDK initialization, route registration, and resource cleanup in the owning extension.

Move domain logic, schemas, services, types, and UI components into nearby owned files as complexity
appears. Keep the entrypoint responsible for registration and lifecycle wiring, not business rules
or reusable utility implementations.

Sandbox mode is optional in this repository; use it only when an extension's requirements fit its
restrictions and Marketplace distribution justifies the trade-off. Do not import arbitrary workspace
packages from sandboxed code. Use the Directus MCP to verify event and context contracts.
