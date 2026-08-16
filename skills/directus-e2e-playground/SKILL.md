---
name: directus-e2e-playground
description:
  Use the Directus E2E playground only to validate packed extension behavior in this repository.
---

# Directus E2E playground

`@onderwijsin/directus-extension-e2e-playground` is a private development fixture, not a production
extension. It logs item lifecycle events and exercises the packed `extension-utils` package. It
requires a trusted Directus 12.2+ instance running Node 24; the repository E2E Compose stack is the
supported setup.

Install it with:

```sh
pnpm test:e2e
```

Place the package directory containing `package.json` and `dist/` in Directus' `extensions/`
directory and restart Directus. This extension is non-sandboxed because it imports the shared
`extension-utils` package, so it is not available when Marketplace trust is limited to sandboxed
extensions.

Do not use it as a general-purpose audit log: messages are process logs, are not persisted, and do
not provide a complete history or security record.
