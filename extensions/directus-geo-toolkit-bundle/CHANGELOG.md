# Changelog

## 0.1.0

### Minor Changes

- f93f317: Add Geo Toolkit with Mapbox address entry, address extraction from Mapbox and Google
  values, polygon centroids and adaptive interior point grids. All operations transform complete
  Flow payloads with configurable output fields and overwrite policies.

## Unreleased

- Add Geo Toolkit with a Mapbox address interface and three offline Flow transforms: address
  extraction, polygon centroids and adaptive polygon point grids.
- Support Geo Toolkit and Google-backed Directus Labs address values, configurable output fields,
  overwrite policies and native Directus Point/MultiPoint destinations.
- Include area-weighted and spherical vertex centroid methods, polygon holes, adaptive grid count
  bounds and boundary/vertex clearance.
- Document installation, provider configuration, Flow chaining and the trigger response required to
  persist transformed payloads.
