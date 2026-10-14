# Shared contracts

`address.schema.ts` defines provider-neutral address fields, geographic feature types and WGS84
positions used by the interface. Mapbox provenance is added by its own adapter schema. Payload and
polygon geometry modules remain reserved for the future operations. Preserve browser/server import
boundaries when implementing those modules.
