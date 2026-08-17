# `test-utils`

`@workspace/test-utils` contains private Vitest, Directus E2E, and process-worker helpers. It must
never be imported by published extension runtime code.

## Package dependency and imports

Add the workspace package to an E2E extension package:

```json
{
  "devDependencies": {
    "@workspace/test-utils": "workspace:*"
  }
}
```

Import repository helpers from the package root and Directus SDK commands from the explicit
`/commands` subpath:

```ts
import { createDirectusE2EClient } from '@workspace/test-utils'
import { createItem, customEndpoint, deleteItem, updateItem } from '@workspace/test-utils/commands'
```

E2E packages do not need to declare `@directus/sdk` separately.

## Root and user contexts

The configured token is the default root context:

```ts
const client = createDirectusE2EClient({
  baseUrl,
  token,
  composeFiles,
  composeProject,
})

const item = await client.request(createItem('posts', { title: 'root request' }))
```

Run a callback with an isolated user SDK client:

```ts
const policies = await client.withUserContext(userId, (userClient) =>
  userClient.request(
    customEndpoint({
      path: '/users/me/policies',
      method: 'GET',
    }),
  ),
)
```

The callback receives an SDK client authenticated with the user’s static token. The root client is
not mutated, so nested or concurrent tests cannot accidentally retain the user token.

## Ephemeral users and access fixtures

Use `createEphemeralUser` when a test needs a user with nested policies and permissions:

```ts
const user = await client.createEphemeralUser({
  role: {
    name: 'E2E editor',
    policies: [
      {
        name: 'E2E posts policy',
        permissions: [
          {
            collection: 'posts',
            action: 'read',
            fields: ['*'],
          },
        ],
      },
    ],
  },
  policies: [],
})

try {
  await client.withUserContext(user.id, async (userClient) => {
    await userClient.request(customEndpoint({ path: '/users/me', method: 'GET' }))
  })
} finally {
  await user.dispose()
}
```

The disposer removes the user, role, permissions, and policies created for the fixture.

## Compose log assertions

`waitForLog` polls `docker compose logs directus` until a regular expression matches:

```ts
await expect(client.waitForLog(/directus-e2e-playground: utilities /u)).resolves.toBeDefined()
```

Use it for extension-side effects that are not represented by the HTTP response. The helper is
generic; fixture creation remains in the test that owns the fixture.

## Process workers

Use `createProcessWorker` for tests that need a real Node process boundary:

```ts
const worker = await createProcessWorker(workerPath, {
  directory: temporaryDirectory,
})

try {
  await worker.request({ type: 'write-marker' })
} finally {
  await worker.terminate()
}
```

Keep worker entrypoints and provider-specific messages beside the integration test. The shared
package should contain only reusable worker lifecycle and transport behavior.
