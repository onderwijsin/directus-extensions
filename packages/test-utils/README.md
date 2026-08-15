# `@workspace/test-utils`

Private test infrastructure for this workspace. It centralizes reusable Vitest and Directus E2E
helpers so package-specific tests can focus on the behavior they verify. It is not a published
package and must never become a runtime dependency of an extension.

The package currently provides the small authenticated Directus client used by the isolated E2E
stack. For its API boundaries and promotion rules, read the
[test-utils cookbook article](../../docs/extension-cookbook/test-utils.md) and the
[testing guide](../../docs/testing.md).

## Extending the package

Add a helper only when it is shared by multiple tests or packages. Keep one-off fixtures next to the
tests that use them. Helpers should exercise the public extension contract and the shared Directus
instance where practical; source-only mocks must not hide registration or packaging failures.

Do not add production helpers here, and do not import this package from a published package's
runtime code.

## Development

This package has no runtime build, dev server, or watch script. Typecheck it from the repository
root with:

```sh
pnpm --filter @workspace/test-utils typecheck
```

Run the repository's interactive test loop while developing helpers:

```sh
pnpm test:watch
```

## Testing policy

Tests belong to the package or extension whose behavior they exercise. Add unit tests for
deterministic helpers and package-specific Directus E2E tests under that package's `__tests__/`
directory. E2E tests must exercise a built extension through Directus rather than importing
extension source directly.

Use `pnpm test` for unit tests, `pnpm test:coverage` for the coverage run, and `pnpm e2e` for the
isolated Directus E2E stack. Do not add tests merely to satisfy a coverage threshold.
