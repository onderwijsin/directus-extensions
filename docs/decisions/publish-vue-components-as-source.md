# Decision: Publish shared Vue components as source

- **Status:** Accepted
- **Date:** 2026-10-02
- **Scope:** `@onderwijsin/directus-extension-utils` app components and Directus extension builds

## Context

The Iconify bundle and Markdown editor need one picker implementation. Both are Vue-based Directus
app bundles, while `extension-utils` otherwise publishes compiled JavaScript. The picker uses Studio
components registered by Directus and scoped Vue styles.

## Decision

Publish the two exported Vue components and their declarations under the package's `components/`
directory. Compile their TypeScript helpers into the `/app/iconify` runtime subpath. Each consuming
Directus app build compiles the Vue source and styles. Keep `src/` out of the published archive. The
package validator permits only the named component files and their declarations, and checks their
exports. This exception does not make arbitrary package source publishable.

## Alternatives considered

- Compile Vue components in `extension-utils`: introduces a separate Vue and CSS build pipeline for
  assets already compiled by every consumer's Directus app build.
- Recreate the picker in each extension: duplicates interaction and API behavior.

## Consequences

Consumers of these component subpaths need Vue SFC support. The components depend on Directus
Studio's registered UI components, so they are intended for Directus app bundles. The shared package
owns the picker behavior and its compiled helpers; the iconify bundle alone owns the optional proxy.
Packed-consumer validation must verify that the component files and compiled helper subpath ship
together.

## Reconsideration criteria

Revisit this layout if a consumer needs the components without Vue SFC compilation or if Directus
changes how app extensions compile dependency components.
