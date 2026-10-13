# @onderwijsin/directus-geo-toolkit-bundle

**Geo Toolkit** is a Directus bundle scaffold for a Mapbox address interface and three geodata Flow
transforms. The package is private and not released. Registrations exist; extension logic and
configurable options are intentionally empty.

## Registered entries

| Entry ID                            | Studio name                   | Current behavior                             |
| ----------------------------------- | ----------------------------- | -------------------------------------------- |
| `geo-mapbox-address-interface`      | Mapbox Address                | JSON interface rendering an empty container. |
| `geo-extract-geolocation-operation` | Extract Geolocation Data      | Empty operation handler; no result.          |
| `geo-calculate-centroid-operation`  | Calculate Polygon Centroid    | Empty operation handler; no result.          |
| `geo-polygon-grid-points-operation` | Calculate Polygon Grid Points | Empty operation handler; no result.          |

Do not use the empty operations as filter Flow responses: they do not yet return the input payload.
No search, map, extraction, centroid, grid, validation, credentials, or item mutation is
implemented. There is no geocoding endpoint and no environment configuration. All entries expose no
options yet.

## Installation and development

There is no published npm installation for this private scaffold. Build from this workspace after
installing its declared development dependencies using the repository's supported setup:

```sh
pnpm --filter @onderwijsin/directus-geo-toolkit-bundle build
pnpm --filter @onderwijsin/directus-geo-toolkit-bundle dev
pnpm --filter @onderwijsin/directus-geo-toolkit-bundle typecheck
```

The build creates `dist/app.js` and `dist/api.js`. Load the built package directory into the trusted
Directus runtime using the repository's extension mount. Restart Directus or use its extension
reload support. The expected target is Directus `>=12.2.0 <13` and Node `>=24.10.0`; runtime loading
must be verified before claiming compatibility. The API operations are non-sandboxed and require a
trusted host, so sandbox-only installation environments are unsupported.

## Planned behavior

The future interface will call Mapbox directly with ofetch, resolving an interface-option key before
`directus_settings.mapbox_key`, and expose configurable permanent geocoding. Temporary results
remain subject to Mapbox's storage restrictions, including development environments. Credentials and
all options described here are planned, not implemented. No Mapbox account or token is needed to
build or load the empty scaffold.

The future operations will extend and return complete input payloads for blocking/filter Flows.
Directus will perform persistence. Mappings, policies, algorithms, projections, spacing and limits
will have configurable defaults. No automatic collections, fields, hooks or Flows are provisioned.

## Specification and troubleshooting

[SPEC.md](SPEC.md) is the implementation plan. `package.json` is the authoritative registration
manifest. Source modules reserve implementation boundaries with empty exports; they are not public
consumer APIs. Generated output stays untracked.

An empty interface and operations with no options/results are expected at this stage. If entries do
not load, check the build output, declared Directus version range and trusted extension loading.
Before release, implement the planned behavior and synchronize this README, the consumer skill,
tests, package validation, changelog and Changesets.
