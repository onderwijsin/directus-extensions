# Testing

Tests belong to the package they exercise. Test the contract a Directus consumer depends on, not
coverage thresholds.

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

E2E tests are named `*.e2e.test.ts` under `tests/e2e/` and are excluded from the regular unit-test
project. They must exercise the built extension through Directus rather than importing extension
source directly.

Use `pnpm test:coverage` for the V8 coverage run. Coverage includes source files under `extensions/`
and `packages/`, while generated output, declarations, and test files are excluded.

Do not import source through private paths in tests when the public package contract is what
matters. Do not add tests solely to satisfy coverage. Keep generated output and local service data
out of git.

## Vitest environments

The root `vitest.config.ts` uses the Node environment by default and loads `test/setup.ts` for every
test project. Tests that need browser APIs or Vue component rendering should use one of these
filename suffixes:

- `*.dom.test.ts` or `*.dom.spec.ts` for browser APIs;
- `*.vue.test.ts` or `*.vue.spec.ts` for Vue-oriented tests.

Those files run in `happy-dom`; all other tests run in Node. The shared setup restores Vitest mocks
after each test. Add reusable Directus-specific fixtures or helpers to `packages/test-utils` when
they emerge; the package is intentionally still an empty scaffold.
