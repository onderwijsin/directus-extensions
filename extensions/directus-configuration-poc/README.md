# Directus configuration POC

This is a review brief for issue
[#35](https://github.com/onderwijsin/directus-extensions/issues/35), not consumer documentation.

Package: `@onderwijsin/directus-configuration-poc`

The package is intentionally marked `private` in `package.json`. It remains part of the workspace
build, package validation, packed-artifact E2E flow, and CI, but Changesets will not version, tag,
or publish it. The repository Changesets configuration enforces this through `privatePackages`.

## Question

Can a Directus hook extension load trusted, consumer-owned TypeScript configuration during startup,
validate it, and use it to orchestrate hook registration without introducing a separate package?

## POC result

Yes, with an important lifecycle constraint: the `defineHook` handler is not awaited by Directus, so
bootstrap-time loading and registration must be synchronous. Async loading is still valid inside an
already-registered filter, action, initialization, or schedule handler.

The POC demonstrates both paths:

- synchronous Jiti loading during extension setup;
- asynchronous, ESM-compatible Jiti loading inside a `server.start` action.

The loaded default export is validated with Zod. The configuration is intentionally minimal:

```ts
import { defineConfig } from '@onderwijsin/directus-configuration-poc/config'

export default defineConfig({
  value: process.env.POC_SECRET ?? 'fallback',
})
```

## Build decision

The hook uses the normal Directus Rollup build. The public `./config` entry uses one small tsdown
build, with declarations emitted directly into the same `dist/` directory:

```text
dist/index.js       Directus hook
dist/config.mjs     Config helper with bundled Zod runtime
dist/config.d.ts    Public TypeScript declaration
```

This avoids a standalone package and avoids extending Directus' undocumented Rollup configuration
for a second entrypoint. See [finding 001](findings/001.build-and-bundling.md).

## Scope and boundary

- This is a non-functional proof of concept; it does not provide a meaningful Directus feature.
- The configuration file is executable code in the Directus Node.js process and must be trusted.
- The package is not intended for Directus Cloud, Marketplace, or sandbox-only deployment.
- External configuration must be available inside the Directus container and able to resolve the
  package's `./config` subpath.

Installation requirements and a custom-image example are documented in
[finding 003](findings/003.installation.md).

## Findings

- [001 — Build and bundling](findings/001.build-and-bundling.md)
- [002 — Sync and async loading](findings/002.sync-async-loading.md)
- [003 — Installation](findings/003.installation.md)

## Review focus

1. Is synchronous Jiti loading an acceptable trade-off while Jiti's synchronous API is deprecated?
2. Is the trusted-code boundary acceptable for the intended self-hosted deployments?
3. Should this pattern become a reusable extension utility or remain embedded in the eventual
   implementation?
