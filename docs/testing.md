# Testing

Test the contract a Directus consumer depends on. Keep tests beside the package they exercise.

## Testing philosophy

> Test primarily the intended workflow, not every possible misuse of its input. Tests should protect
> meaningful behavioral contracts and concrete risks, not implementation history or theoretical edge
> cases.

Aim for the smallest maintainable suite that provides sufficient confidence, not maximum coverage or
the fewest possible tests. Rejection and failure cases earn their place through supported contracts
or concrete risks. Runtime validation, authorization, persistence, concurrency, compatibility and
resource cleanup can need distinct protection even for rare inputs.

Use [review-test-value](../.agents/skills/review-test-value/SKILL.md) to assess that protection and
recommend keep, improve, consolidate or remove. The skill's review is read-only; apply justified
changes through the [agent workflow](agent-workflow.md).

## Choosing and maintaining tests

Add a permanent test only for a concrete protection gap in existing coverage. When choosing or
reviewing cases, establish for each case or equivalent group:

1. The supported behavior or invariant and plausible regression it protects.
2. The production path exercised and observable result asserted.
3. The independent basis for the expected result: a requirement, protocol example, known result,
   still-relevant regression or independently derived invariant.
4. Whether that regression would make the assertion fail.
5. The distinct protection beyond neighboring tests and which harmless refactors would break it.

Keep this reasoning proportional; working notes suffice. Explicit current requirements can supersede
historical expectations. A cleanup preference cannot retire a supported contract.

Prefer improving existing workflow tests over adding overlapping cases, excessive parameterization
or assertions about private structure. A bug fix does not automatically require a permanent
regression test, especially before the first release. Reproduce the failure when practical and
confirm the fix; retain a new case only when it adds meaningful protection. A coverage target or
missing helper test alone does not establish a gap.

Expected values obtained by calling the subject again, copying its algorithm or repeating mock setup
can share the defect being tested. Characterization tests can establish unchanged behavior while
offering weaker evidence of correctness; make that distinction explicit. Mocks, snapshots and
interaction assertions remain useful when they observe a real contract, such as an outbound payload,
transaction order or retry limit. Use a real integration or E2E test when mocks cannot establish
runtime wiring or compatibility.

Before consolidating tests, compare their contract, meaningful input class, production path,
observable result and failure mode. Similar outputs alone do not prove redundancy. Name the
surviving evidence and any protection lost; a passing remaining suite alone does not justify
removal. Preserve uncertain cases and identify the missing evidence. Remove fixtures and mocks only
after checking surviving consumers. Removing a test does not authorize removing production behavior.

## Selecting verification for a change

Select local checks for the task's changed or explicitly reviewed surfaces and their affected
consumers. Unrelated dirty files do not expand the scope. Use focused file, Vitest project or
package checks when they cover the contract; broaden only for a concrete risk or failure. Stop once
sufficient evidence is established. Required hooks, CI and release gates remain unchanged; see
[CI](ci.md) and [publishing](publishing.md).

The commands below use `pnpm` for readability; agents invoke them through `corepack pnpm` under
[workspace safety](workspace.md#for-agents). Root commands are available when the scope needs them;
use their focused equivalents for narrower changes.

| Affected surface                                                                          | Local validation                                                                                                                                |
| ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Any changed files                                                                         | Oxfmt check of task files, e.g. `pnpm exec oxfmt --check <files>`, and scoped diff review                                                       |
| Documentation only                                                                        | Formatting, `pnpm validate:docs`, and links, anchors and consistency review; no builds or test suites                                           |
| Source or tests                                                                           | Applicable lint, owning package typecheck and focused unit/component tests; root scripts are `pnpm lint`, `pnpm typecheck` and `pnpm test:unit` |
| GitHub Actions                                                                            | `pnpm lint:actions` and the review in [Actions](actions.md)                                                                                     |
| Process or filesystem coordination, including locks and marker stores                     | `pnpm build:utils`, then `pnpm test:integration` or its focused equivalent                                                                      |
| Public package metadata, exports, dependencies, build output or runtime behavior          | Applicable build, package and packed-consumer checks in [workspace](workspace.md#external-and-directus-validation)                              |
| Directus loading, built extensions, runtime integration, Compose services or E2E behavior | `pnpm test:e2e`; use the packed-consumer path when package loading or artifacts are affected                                                    |

Build extension-utils before type-aware linting as documented in
[workspace](workspace.md#working-with-packages-and-extensions). Lint passes only with zero errors
and zero warnings. Keep formatting and autofixes within task files; read-only reviews use no-write
check modes.

For example, select an owning package's typecheck with `pnpm --filter <package> typecheck` and
existing unit cases with `pnpm test:unit --project node <test-file>`. Check
[`vitest.config.ts`](../vitest.config.ts) for discovery and enabled projects. Integration and E2E
projects need their runner setup; a green run that collected no relevant tests is not evidence.
Investigate unexpected collection drops, skips or deselections when tests or tooling change.

Run `pnpm test:unit:coverage` when coverage output or coverage-sensitive source changes are
relevant. Coverage supports investigation; it does not determine which tests deserve to exist.
Report exact commands and actual results, including blocked relevant checks, in the workflow
handoff.

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

Do not create `test/` directories. Use only the `.test.ts` suffixes shown above. Checked-out
upstream repositories under `.reference/` are documentation/source references, not workspace test
inputs, and are excluded from every Vitest project.

## Test layers

- Unit tests cover schemas, guards, utilities, and deterministic logic.
- Extension tests cover registration, observable behavior, and malformed input or error paths that
  protect a meaningful contract or concrete risk.
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

Allow the full startup window before diagnosing an unresponsive stack: image and dependency cache
misses can make Compose-backed services take one to eight minutes to become responsive. E2E runners
must remove their Compose project and disposable volumes on success, failure and interruption; never
stop the shared Docker daemon for test cleanup. See
[Docker readiness and timeouts](docker.md#readiness-and-timeouts) for the operation, health-check
and startup limits.

The E2E overlay explicitly enables the Schema Snapshot bundle for its CLI tests and disables
automatic snapshots. These settings are independent of the local development defaults.

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

External integrations used by extension E2E tests must be represented by Compose mock services or
deterministic test doubles. The Loops bundle uses `tests/loops-mock/` and does not contact a live
Loops account.

Test operations and log polling time out after 60 seconds. Compose health checks wait up to three
minutes.

## Vitest environments and cleanup

The default environment is Node. Use the suffixes in the table above for browser or Vue tests.
Shared setup is loaded from `tests/setup.ts`.

No global pre-test cleanup is needed. Use targeted cleanup in the owning test and keep it in
`finally` blocks. Generated `dist/`, coverage, and local service data remain ignored.
