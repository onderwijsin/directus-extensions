# `@onderwijsin/directus-extension-e2e-playground`

Private Directus hook used by the repository's packed-artifact E2E tests. It logs item lifecycle
events and exercises every currently published `extension-utils` utility through Directus.

It registers the `items.create`, `items.update`, and `items.delete` action events. Each message
contains the event, collection, and item key when Directus provides one. Logs are not persisted.

The Redis smoke checks use the same `@directus/memory` cache and key-value patterns as Directus,
backed by the Redis service configured through `REDIS`.

The utility smoke checks live in `src/smoke/`, grouped by concern: attempts, guards, values, cache,
locks, markers, and auto-tasks. The hook entrypoint only registers Directus events and coordinates
the smoke run.

This playground is intentionally non-sandboxed because it imports and exercises the packed
`extension-utils` package. Sandbox hooks cannot import arbitrary workspace packages; future tests
can validate the sandbox path separately.

The extension requires a trusted Directus installation. It is not sandbox-compatible and is not
available for Marketplace installation when `MARKETPLACE_TRUST=sandbox`. Use it only in the
repository's E2E Compose stack or another trusted Directus 12.2+ instance running Node 24.

## Installation

This package is private and is not publishable. The E2E runner packs and installs it into a clean
consumer automatically:

```sh
pnpm test:e2e
```

The E2E preparation script installs the packed archive, then places its package directory containing
`package.json` and `dist/` in the Directus `extensions/` directory. Restart Directus after manual
installation.

## Local development

From the repository root:

```sh
pnpm compose:up
pnpm compose:logs
```

The hook is loaded from the E2E-only playground mount. Use the Directus API or Data Studio to
create, update, and delete an item, then inspect the Directus logs.
