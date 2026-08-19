---
name: directus-e2e-playground
description:
  Use the Directus E2E playground only to validate packed extension behavior in this repository.
---

# Directus E2E playground

`@onderwijsin/directus-extension-e2e-playground` is a private development fixture, not a production
extension. It logs item lifecycle events and exercises the packed `extension-utils` package. It
requires a Directus 12.2+ instance running Node 24; the repository E2E Compose stack is the
supported setup.

Install it with:

```sh
pnpm test:e2e
```

Place the package directory containing `package.json` and `dist/` in Directus' `extensions/`
directory and restart Directus.

Do not use it as a general-purpose audit log: messages are process logs, are not persisted, and do
not provide a complete history or security record.

## Boundaries

This private fixture is not sandboxed, so it does not carry the trust required for Directus
Marketplace distribution. It is intended to be installed from the repository for E2E validation, not
published as a consumer npm package. It creates or changes no collections, fields, relations, roles,
policies, permissions, or persistent data; it only emits process-log messages.
