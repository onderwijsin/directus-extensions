# Geo Toolkit test reservation

This directory reserves contract tests; `fixtures/` reserves deterministic provider/geometry inputs.
No empty or placeholder tests are added. Add tests alongside implemented behavior using repository
`*.test.ts`, `*.vue.test.ts`, and `*.e2e.test.ts` suffixes. CI must not contact live Mapbox
services.

See [the bundle specification](../SPEC.md#acceptance-and-validation).
