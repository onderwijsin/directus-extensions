# Mapbox address interface

`utils/props.ts` derives runtime option declarations from the schema because Vue cannot resolve
Zod-inferred option types in its type-only prop compiler. `utils/types.ts` keeps the public prop
type schema-derived. `index.ts` registers the JSON input and configurable options. `interface.vue`
owns presentation and explicit Directus input events. `components/AddressMap.vue` owns map
presentation; `composables/` owns credential resolution, search scheduling and map lifecycle.
`utils/geocoding.ts` owns the ofetch request and validated response conversion. Mapbox CSS is
included through a Vue CSS import, avoiding an untyped TypeScript side-effect import.
Option/provider schemas validate those boundaries; `utils/normalize.ts` produces the shared
version-one address contract. Scoped Vue declarations must stay aligned with component props/events
for typed tooling.

See the [consumer README](../../README.md) for setup and
[specification](../../SPEC.md#mapbox-address-interface) for the intended contract.
