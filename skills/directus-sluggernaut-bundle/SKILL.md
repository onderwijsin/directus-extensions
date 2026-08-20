---
name: directus-sluggernaut-bundle
description: Configure and operate the Sluggernaut V2 Directus bundle.
---

# Sluggernaut V2

Sluggernaut V2 is being scaffolded as a fresh rewrite in `@onderwijsin/directus-sluggernaut-bundle`.
The package exposes slug and permalink interfaces, a link display, a coordinated server hook, and a
recalculation operation.

## Installation

```sh
pnpm add @onderwijsin/directus-sluggernaut-bundle
```

Install the bundle in a trusted Directus `12.2.0` or newer runtime and restart Directus. This
extension is non-sandboxed and is not eligible for Directus Marketplace distribution.

Slug and permalink derivation is implemented in a single server mutation pipeline. It discovers
fields by interface metadata, derives slugs before permalinks, resolves missing source values from
the existing item, and gives explicit payload values precedence. Permalinks remain stable when their
source slug changes unless synchronization is enabled. Ambiguous bulk derivation is rejected.

Canonical redirect planning and update-time creation are implemented when
`SLUGGERNAUT_REDIRECTS_ENABLED=true` and the selected first interface enables automatic redirects.
The planner prefers the first permalink source, falls back to the first slug source, preserves
unowned conflicts, flattens managed chains, and records managed provenance.

The complete Directus E2E matrix remains pending from the implementation plan. Optional schema
registration and policy registration use the repository startup coordinator and locks; policies are
never assigned automatically. Delete/archive lifecycle handling now deactivates managed redirect
history and reactivates only archive-suspended records. The recalculation operation is implemented
with bounded pagination, strict derived-field selection, dependency ordering, and optional redirect
creation. Redirect-store failures are logged and do not discard the content mutation.

The authoritative maintainer plan is
[`SLUGGERNAUT_IMPLEMENTATION.md`](../../SLUGGERNAUT_IMPLEMENTATION.md).
