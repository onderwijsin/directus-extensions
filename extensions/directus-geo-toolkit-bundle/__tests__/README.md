# Geo Toolkit tests

Address contract tests cover normalization, options and credential precedence. Editor tests cover
search stale-response handling (including responses after clearing), input loading indicators,
selection/clear and allowClear=false, disabled modes, external changes and safe error feedback. Map
lifecycle tests use a deterministic renderer double; no live billable Mapbox calls are made. The
polygon-operation fixtures and tests remain future work.

`pnpm --filter @onderwijsin/directus-geo-toolkit-bundle test:bundle` builds the actual app artifact
and checks map-component loading, reserved height, geocoding, and selecting a result from the
compiled interface, including clearing the selection and omitting duplicate selection/attribution
text. Its store doubles include user and project appearance state. Its opt-in test is skipped during
source unit checks, which run before extension builds. Provider data and fetch are synthetic; the
built renderer uses the DOM's unavailable-WebGL path.
