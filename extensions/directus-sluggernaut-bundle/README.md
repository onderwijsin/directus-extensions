# Sluggernaut V2

Sluggernaut V2 is a Directus bundle for field-driven slugs, permalinks, link displays, redirect
lifecycle management, and recalculation.

## Installation

```sh
pnpm add @onderwijsin/directus-sluggernaut-bundle
```

Install it in a Directus `12.2.0` or newer runtime and restart Directus. This bundle is
non-sandboxed and requires a trusted self-hosted Directus runtime; it is not a Marketplace-safe
extension.

The current implementation includes field configuration discovery, slug derivation, permalink
derivation, server-side path validation, locked Studio field shells, canonical redirect
planning/creation for updates, delete/archive lifecycle handling, and a paginated recalculation
operation. Optional redirect schema registration and policy registration use repository startup
locks and remain disabled by default. Deletion/archive lifecycle handling is implemented
incrementally according to [`SLUGGERNAUT_IMPLEMENTATION.md`](../../SLUGGERNAUT_IMPLEMENTATION.md).

Slug and permalink derivation runs in one server mutation pipeline. Slugs are derived before
permalinks, explicit values win for the current mutation, source values are resolved against the
final item state, and existing permalinks remain stable by default. Bulk updates that would require
per-item derivation are currently rejected rather than assigned one shared derived value. Redirect
processing is opt-in through `SLUGGERNAUT_REDIRECTS_ENABLED` and failures are logged without
discarding the slug/permalink mutation.

`Sluggernaut: Recalculate Fields` accepts a collection, an optional exact field-key allowlist, and
`createRedirects`. It processes items in bounded pages, recalculates selected derived fields only,
and never implicitly recalculates dependent permalinks when only a slug is selected.

Schema and policy setup is controlled by `SLUGGERNAUT_SCHEMA_CHANGES_ENABLED`,
`SLUGGERNAUT_MANAGE_REDIRECTS_POLICY_ENABLED`, and
`SLUGGERNAUT_READ_ACTIVE_REDIRECTS_POLICY_ENABLED`, together with the repository-wide schema,
data-seed, and lock settings. Policies are created without being assigned to roles.

## Entries

- `sluggernaut-slug` — slug interface
- `sluggernaut-permalink` — permalink interface
- `sluggernaut-link` — slug/permalink display
- `sluggernaut-hook` — coordinated server hook
- `sluggernaut-recalculate` — recalculation operation

The V2 rewrite does not carry forward the legacy extension's hierarchy, namespace, or system
metadata behaviour.
