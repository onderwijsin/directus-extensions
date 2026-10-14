# Extract Geolocation Data

`app.ts` exposes payload, source, output mappings and overwrite/missing-value policies. `api.ts`
validates options and delegates to the offline, immutable transform in `utils/transform.ts`. The
transform supports the interface's version-one Mapbox address and Directus Labs Google address
Features, returning a complete item or batch for a blocking filter Flow response.

See [consumer options and setup](../../README.md#extract-geolocation-data) and
[the bundle specification](../../SPEC.md#extract-geolocation-operation).
