# Shared contracts

`geometry.schema.ts` defines WGS84 `positionSchema` and `geoJsonPointSchema` for the interface and
extraction operation. `address.schema.ts` defines provider-neutral address fields, geographic result
types and versioned values; its strict Point geometry preserves the saved-value contract.
`google-address.schema.ts` validates the persisted Directus Labs Google address Feature. Mapbox
provenance is added by the interface adapter schema. Payload and polygon-specific modules remain
reserved. Preserve browser/server import boundaries when using these schemas.
