# Geo Toolkit tests

Address contract tests cover normalization, options and credential precedence. Editor tests cover
search stale-response handling (including responses after clearing), input loading indicators,
selection/clear and allowClear=false, disabled modes, external changes and safe error feedback. Map
lifecycle tests cover equivalent editor updates, live selection and theme changes using a
deterministic renderer double; no live billable Mapbox calls are made. Polygon tests cover both
centroid methods, holes, invalid topology, adaptive count bounds and clearance. A filter Flow test
chains the operations and verifies native Point/MultiPoint persistence, partial updates, explicit
overrides, null clearing, missing trigger responses and separate filters on the same hook.
Extraction tests cover both saved address shapes, complete immutable payloads, overwrite and
missing-value policies, configurable destinations, coordinate precision, invalid sources and batch
failures. The extraction E2E test creates a blocking filter Flow and verifies persisted create
fields, manual overrides and partial updates; it removes its Flow and collection afterwards.

`pnpm --filter @onderwijsin/directus-geo-toolkit-bundle test:bundle` builds the actual app artifact
and checks map-component loading, reserved height, geocoding, and selecting a result from the
compiled interface, including clearing the selection and omitting duplicate selection/attribution
text. Its store doubles include user and project appearance state. Its opt-in test is skipped during
source unit checks, which run before extension builds. Provider data and fetch are synthetic; the
built renderer uses the DOM's unavailable-WebGL path.

The bundle is included in the normal publishable-package artifacts used by CI. Validate integration
with `pnpm pack:packages` and `pnpm prepare:e2e-consumer`, then run the E2E runner with
`DIRECTUS_E2E_EXTENSIONS_DIR` pointing to that consumer's extensions. This verifies that Directus
loads the packaged bundle rather than relying on workspace-only extension loading.
