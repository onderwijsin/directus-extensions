# Geo Toolkit tests

Address contract tests cover normalization, options and credential precedence. Editor tests cover
search stale-response handling (including responses after clearing), input loading indicators,
selection/clear and allowClear=false, disabled modes, external changes and safe error feedback. Map
lifecycle tests use a deterministic renderer double; no live billable Mapbox calls are made. Polygon
tests cover both centroid methods, holes, invalid topology, adaptive count bounds and clearance. A
filter Flow test chains the operations and verifies native Point/MultiPoint persistence, partial
updates, explicit overrides and null clearing. Extraction tests cover both saved address shapes,
complete immutable payloads, overwrite and missing-value policies, configurable destinations,
coordinate precision, invalid sources and batch failures. The extraction E2E test creates a blocking
filter Flow and verifies persisted create fields, manual overrides and partial updates; it removes
its Flow and collection afterwards.

`pnpm --filter @onderwijsin/directus-geo-toolkit-bundle test:bundle` builds the actual app artifact
and checks map-component loading, reserved height, geocoding, and selecting a result from the
compiled interface, including clearing the selection and omitting duplicate selection/attribution
text. Its store doubles include user and project appearance state. Its opt-in test is skipped during
source unit checks, which run before extension builds. Provider data and fetch are synthetic; the
built renderer uses the DOM's unavailable-WebGL path.
