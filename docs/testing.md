# Testing

Tests belong to the package they exercise. Test the contract a Directus consumer depends on, not
coverage thresholds.

## Test layout

The repository has one top-level `tests/` directory for shared test setup, test infrastructure, and
tests that are not specific to a package. Package-specific tests belong in that package's
`__tests__/` directory, including package-specific E2E tests. Do not create or use a separate
top-level `test/` directory.

The shared Vitest setup is `tests/setup.ts`. The isolated Directus E2E Compose definition is
`tests/compose.e2e.yaml`. The E2E runner remains in `scripts/e2e.mjs` because it is repository
orchestration rather than a test or fixture.

## Layers

- pure unit tests cover utilities, schemas, guards, and deterministic extension logic;
- extension tests cover registration, observable hook behavior, malformed inputs, errors, and
  sandbox limitations; and
- the shared local Directus instance provides the first integration check for extension loading.

The initial CI only runs format, lint, typecheck, and the V8-covered unit test suite.
Packed-artifact and external-consumer validation are deliberately deferred to a later CI version.

## Directus E2E tests

Run `pnpm e2e` to build the extensions and test them against an isolated Directus 12.2.0 and
PostgreSQL Compose stack. The runner creates a user collection named `posts` and a required `title`
field through the Directus data-model API before starting the E2E Vitest project. Tests then create,
update, and delete items only in that user collection.

The E2E stack uses named Docker volumes and the `directus-extensions-e2e` Compose project. It does
not reuse local `.data` directories. The runner always removes the containers, network, and database
volume after the test, and prints the service logs when startup or a test fails.

E2E tests are named `*.e2e.test.ts` (or `*.e2e.spec.ts`) under the relevant package's `__tests__/`
directory and are excluded from the regular unit-test project. They must exercise the built
extension through Directus rather than importing extension source directly. The E2E Vitest project
is activated only when the runner has initialized all four `DIRECTUS_E2E_*` environment variables;
this keeps `pnpm test` focused on unit and component tests.

Use `pnpm test:coverage` for the V8 coverage run. Coverage includes source files under `extensions/`
and `packages/`, while generated output, declarations, and test files are excluded.

Do not import source through private paths in tests when the public package contract is what
matters. Do not add tests solely to satisfy coverage. Keep generated output and local service data
out of git.

## Vitest environments

The root `vitest.config.ts` uses the Node environment by default and loads `tests/setup.ts` for
every test project. Tests that need browser APIs or Vue component rendering should use one of these
filename suffixes:

- `*.dom.test.ts` or `*.dom.spec.ts` for browser APIs;
- `*.vue.test.ts` or `*.vue.spec.ts` for Vue-oriented tests.

Those files run in `happy-dom`; all other tests run in Node. The shared setup restores Vitest mocks
after each test. Add reusable Directus-specific fixtures or helpers to `packages/test-utils` when
they emerge; the package is intentionally still an empty scaffold.

## Test cleanup

No pre-test cleanup hook is currently needed. Unlike Nuxt Modules, this repository does not create
framework-generated test directories that must be removed before Vitest starts. Unit tests use
temporary in-memory or mocked state, and the E2E runner creates a uniquely named Compose project and
removes its containers, network, and database volume in its `finally` block. Keep generated output
such as `dist/`, coverage, and local service data ignored rather than deleting it globally in a
pre-test hook. Add targeted cleanup only when a test introduces a persistent artifact and its
ownership and lifecycle are documented.
