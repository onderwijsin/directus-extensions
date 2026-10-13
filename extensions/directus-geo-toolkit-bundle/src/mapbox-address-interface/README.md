# Mapbox address interface scaffold

`index.ts` registers the JSON interface and `interface.vue` renders an empty container. No options,
props, emits, search requests, credentials, or map behavior are implemented.

`interface.vue.d.ts` describes only this empty component for TypeScript tooling without Vue support.
Update this scoped declaration alongside the component contract when implemented.

`options.schema.ts`, `response.schema.ts`, `types.ts`, `normalize.ts`, and the modules under
`composables/` reserve the future option boundary, address types, provider normalization, credential
resolution, geocoding requests, and map lifecycle. They export nothing yet.

See [the bundle specification](../../SPEC.md#mapbox-address-interface).
