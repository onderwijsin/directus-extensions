# Extract Geolocation Data scaffold

`app.ts` registers the operation with no options. `api.ts` registers an intentionally empty handler
that returns no result. Do not use it as a filter Flow response until implemented.

`options.schema.ts`, `types.ts`, and `transform.ts` reserve the option boundary, types, and pure
payload transformation. These modules export nothing yet.

See [the bundle specification](../../SPEC.md#extract-geolocation-operation).
