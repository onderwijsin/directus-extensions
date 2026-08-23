# Testing

Test the contract a Directus consumer depends on. Keep tests beside the package they exercise.

## Directus Core plan limits

The E2E stack runs on the Directus Core plan. Tests must stay within these project limits:

- 3 user seats total, including the root administrator. At most 2 ephemeral users may exist at the
  same time;
- 25 collections;
- 5 flows; and
- no granular RBAC, including row-level or field-level security per policy.

Create ephemeral users only for the scenario that needs them and dispose of them in a `finally`
block. Do not write a scenario that requires more than 2 non-root users to exist concurrently; split
it into sequential cases or reuse one user where the behavior permits it.

## Test layout

```text
tests/
  setup.ts                 # shared Vitest setup and E2E Compose definition
packages/<name>/__tests__/ # package tests
extensions/<name>/__tests__/
scripts/e2e.mjs            # Compose orchestration, not a test fixture
```

Use these filename conventions:

| Test type           | Filename                | Vitest project     |
| ------------------- | ----------------------- | ------------------ |
| Unit                | `*.test.ts`             | `node`             |
| Browser             | `*.dom.test.ts`         | `vue`              |
| Vue component       | `*.vue.test.ts`         | `vue`              |
| Process integration | `*.integration.test.ts` | `test:integration` |
| Directus E2E        | `*.e2e.test.ts`         | `e2e`              |

Do not create `test/` directories. Use only the `.test.ts` suffixes shown above.

## Test layers

- Unit tests cover schemas, guards, utilities, and deterministic logic.
- Extension tests cover registration, observable behavior, malformed input, and errors.
- Process integration tests cover real child-process and filesystem coordination.
- Directus E2E tests load the built extension through Directus.

## Unit and integration tests

```sh
pnpm test:unit
pnpm build:utils
pnpm test:integration
pnpm test:unit:coverage
```

Integration tests use the `*.integration.test.ts` suffix because they spawn child processes and must
exercise built package output.

## `@workspace/test-utils`

`packages/test-utils` is private test infrastructure. It is never a runtime dependency of a
published extension. E2E extension packages should declare it as a dev dependency:

```json
{
  "devDependencies": {
    "@workspace/test-utils": "workspace:*"
  }
}
```

The package exposes the official Directus SDK commands from an explicit subpath:

```ts
import { createDirectusE2EClient } from '@workspace/test-utils'
import { createItem, customEndpoint, deleteItem, updateItem } from '@workspace/test-utils/commands'

const client = createDirectusE2EClient({
  baseUrl,
  token,
  composeFiles: ['docker/compose.yaml', 'tests/compose.e2e.yaml'],
  composeProject,
})

const post = await client.request(createItem('posts', { title: 'from E2E' }))
await client.request(updateItem('posts', post.id, { title: 'updated' }))
await client.request(deleteItem('posts', post.id))
```

The client uses the root token by default. Use a separate SDK context for a user:

```ts
await client.withUserContext(userId, async (userClient) => {
  const result = await userClient.request(
    customEndpoint({
      path: '/users/me/policies',
      method: 'GET',
    }),
  )

  return result
})
```

Create and dispose access-control fixtures in the test that owns them:

```ts
const user = await client.createEphemeralUser({
  role: {
    name: 'E2E role',
    policies: [
      {
        name: 'E2E policy',
        permissions: [{ collection: 'posts', action: 'read', fields: ['*'] }],
      },
    ],
  },
})

try {
  await client.withUserContext(user.id, async (userClient) => {
    await userClient.request(customEndpoint({ path: '/users/me', method: 'GET' }))
  })
} finally {
  await user.dispose()
}
```

`waitForLog` polls the Directus container output. Use it when the assertion is an extension-side
effect, such as a hook log:

```ts
await expect(
  client.waitForLog(/directus-e2e-playground: item-event .*"event":"created"/u),
).resolves.toBeDefined()
```

For process workers, keep the worker entrypoint and provider-specific protocol beside the test:

```ts
const worker = await createProcessWorker(workerPath, { directory: temporaryDirectory })
try {
  await worker.request({ type: 'check' })
} finally {
  await worker.terminate()
}
```

## Directus E2E tests

Run the isolated stack with:

```sh
pnpm test:e2e
```

The runner builds extensions, starts Compose with health checks, logs in the root administrator,
runs the E2E Vitest project, and removes containers, networks, and named volumes in `finally`. It
does not collect Compose logs.

Tests own their Directus fixtures. For example, the playground creates and removes `posts` locally:

```ts
const disposeCollection = await createPlaygroundCollection()
try {
  await client.request(createItem('posts', { title: 'created' }))
} finally {
  await disposeCollection()
}
```

The policies test similarly owns its roles, policies, permissions, user, and access assignments. Do
not put test-specific collections in the shared runner.

The E2E Vitest project is enabled only when the runner sets all four values below:

```text
DIRECTUS_E2E_URL
DIRECTUS_E2E_TOKEN
DIRECTUS_E2E_COMPOSE_FILES
DIRECTUS_E2E_COMPOSE_PROJECT
```

Test operations and log polling time out after 60 seconds. Compose health checks wait up to three
minutes.

## Vitest environments and cleanup

The default environment is Node. Use the suffixes in the table above for browser or Vue tests.
Shared setup is loaded from `tests/setup.ts`.

No global pre-test cleanup is needed. Use targeted cleanup in the owning test and keep it in
`finally` blocks. Generated `dist/`, coverage, and local service data remain ignored.
