---
name: sample-hook
description:
  Use the sample hook only to validate local Directus extension development in this repository.
---

# Sample hook

`@onderwijsin/directus-extension-sample-hook` is a development fixture, not a production extension.
It logs after `items.create`, `items.update`, and `items.delete` events. It requires a trusted
Directus 12.2+ instance running Node 24; the repository Compose stack is the supported local setup.

Install it with:

```sh
pnpm add @onderwijsin/directus-extension-sample-hook
```

Place the package directory containing `package.json` and `dist/` in Directus' `extensions/`
directory and restart Directus. This extension is non-sandboxed because it imports the shared
`extension-utils` package, so it is not available when Marketplace trust is limited to sandboxed
extensions.

Do not use it as a general-purpose audit log: messages are process logs, are not persisted, and do
not provide a complete history or security record.
