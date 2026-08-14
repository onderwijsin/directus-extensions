# `@onderwijsin/directus-extension-sample-hook`

Development-only sample Directus hook. It logs a message after items are created, updated, or
deleted, and exists to verify workspace dependencies, extension builds, and local Directus loading.

This first sample is intentionally non-sandboxed because it imports and exercises the workspace
`extension-utils` package. Sandbox hooks cannot import arbitrary workspace packages; future samples
can validate the sandbox path separately.

## Local development

From the repository root:

```sh
pnpm compose:up
pnpm compose:logs
```

The hook is loaded from the mounted `extensions` directory. Use the Directus API or Data Studio to
create, update, and delete an item, then inspect the Directus logs.
