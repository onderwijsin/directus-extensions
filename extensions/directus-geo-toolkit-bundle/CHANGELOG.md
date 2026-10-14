# Changelog

## Unreleased

- Implement the configurable Mapbox address JSON interface with credential resolution, v6 geocoding,
  normalized values, keyboard selection, and map presentation. The geodata operations remain empty.
- Add focused boundary, search/editor and map lifecycle regression tests.
- Use Directus search/menu/notice controls over the existing map; simplify normalization and
  schema-derived props, keep Mapbox provenance out of shared schemas, and add component-path
  examples.
- Fix the inlined async map loader, restore map container styling, and keep the search overlay in
  document flow. Include streets and towns in default geocoding and validate the built app artifact.
