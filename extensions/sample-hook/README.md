# `@onderwijsin/directus-extension-sample-hook`

Development-only sample Directus hook. It logs a message after items are created, updated, or
deleted, and exists to verify workspace dependencies, extension builds, and local Directus loading.

It registers the `items.create`, `items.update`, and `items.delete` action events. Each message
contains the event, collection, and item key when Directus provides one. Logs are not persisted.

This first sample is intentionally non-sandboxed because it imports and exercises the workspace
`extension-utils` package. Sandbox hooks cannot import arbitrary workspace packages; future samples
can validate the sandbox path separately.

The extension requires a trusted Directus installation. It is not sandbox-compatible and is not
available for Marketplace installation when `MARKETPLACE_TRUST=sandbox`. Use it only in the
repository's local development stack or another trusted Directus 12.2+ instance running Node 24.

## Installation

Install the published package in a trusted Directus project:

```sh
pnpm add @onderwijsin/directus-extension-sample-hook
```

Build the package, then place its package directory containing `package.json` and `dist/` in the
Directus `extensions/` directory. Restart Directus after installation.

## Local development

From the repository root:

```sh
pnpm compose:up
pnpm compose:logs
```

The hook is loaded from the mounted `extensions` directory. Use the Directus API or Data Studio to
create, update, and delete an item, then inspect the Directus logs.
