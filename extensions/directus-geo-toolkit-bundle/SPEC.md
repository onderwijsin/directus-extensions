# Geo Toolkit implementation specification

Status: registered bundle scaffold; behavioral implementation remains planned. Research checked on
13 October 2026.

## Purpose and scope

Package: `@onderwijsin/directus-geo-toolkit-bundle`. Product name: **Geo Toolkit**.

Provide one Mapbox address interface and three reusable Flow transform operations. Each operation
receives an item payload, extends it with configured derived fields, and returns the complete
transformed payload. A blocking/filter Flow passes that result back to Directus for persistence.
Operations do not fetch records, write records, install hooks, or provision collections or fields.
No collection names or source/destination field names are hardcoded.

The scaffold now includes active `directus:extension` metadata in `package.json`, interface and
operation registrations, an empty Vue component, empty operation handlers, and reserved modules for
schemas, types, transforms and composables. Build/typecheck scripts and required SDK/Vue development
dependencies are declared using existing workspace catalogs. No geodata logic, options, provider
dependencies, credentials or generated output are included. Keep the package private until its
behavior is implemented and validated; no Changeset is needed for this private scaffold.

## Runtime and package boundaries

Proposed target: Directus `>=12.2.0 <13`, Node `>=24.10.0`, TypeScript and Vue 3 Composition API
with `<script setup>`. Verify that range during implementation; this scaffold does not establish
runtime compatibility. [Directus bundles](https://directus.com/docs/guides/extensions/bundles)
register independent entries.
[Operations](https://directus.com/docs/guides/extensions/api-extensions/operations) have separate
app/API entrypoints with matching IDs.

```text
directus-geo-toolkit-bundle/
  package.json                         private bundle manifest
  tsconfig.json                        shared workspace TypeScript configuration
  LICENSE
  CHANGELOG.md
  README.md
  SPEC.md
  src/
    mapbox-address-interface/           index.ts, interface.vue, reserved composables
    extract-geolocation-operation/     app.ts, api.ts, reserved transform modules
    calculate-centroid-operation/      app.ts, api.ts, reserved centroid modules
    polygon-grid-points-operation/     app.ts, api.ts, reserved grid modules
    shared/                            reserved boundary schemas and payload contracts
  __tests__/                           future tests and provider fixtures
```

`package.json` is the authoritative active registration manifest; the earlier `bundle.plan.json` has
been removed. All registrations expose empty options, operation handlers return no result, and the
interface renders an empty container. Do not use the operations as filter responses yet. Browser
code will own Mapbox search/presentation; operation API code will own offline transformations. Do
not pull Mapbox GL JS into `dist/api.js` or server-only dependencies into `dist/app.js`. Keep
registration thin and business logic beside its owning entry.

Initially use ordinary API operations following the repository's accepted sandbox decision, without
claiming support for sandbox-only installations. A later sandbox decision can be evaluated against
the final dependency set. Operations require no database services, environment credentials, or
network calls. Document the trusted-host boundary before release.

## Mapbox integration and tooling

### Geocoding and permanent option

Use Mapbox Geocoding API v6 directly from the interface. Expose `permanent` as a boolean interface
option, default `true`; pass the configured value on every geocoding request. Operators may set
`false` for temporary development previews. Do not silently force true, fall back to false on an
error, or upgrade a temporary response's provenance after changing the option.

Mapbox allows indefinite storage for permanent results and disallows caching temporary results. The
documentation does not provide a development-environment exemption. Therefore `false` is a
request-mode setting, not permission to retain temporary results or their derived components in a
database. Document this beside the option and in deployment guidance. Use synthetic address fixtures
when testing database persistence without permanent requests. Actual result provenance must remain
`temporary` when `permanent=false`. See
[Mapbox storage rules](https://docs.mapbox.com/api/search/geocoding/#storing-geocoding-results).

Prefer v6 Geocoding to Search Box for address-only search; Search Box has different sessions and
storage rights. Do not accidentally switch provider APIs through a generic search widget. See
[Search Box restrictions](https://docs.mapbox.com/api/search/search-box/#search-box-api-restrictions-and-limits).

Use **ofetch**, with explicit query parameters, abort signals, timeout and retry options, plus Zod
response validation. `ofetch` is already exactly pinned in the workspace catalog; add the runtime
dependency only when implementing the interface. Set `retry=0` by default to avoid unexpected
billable retries; expose the count/delay as options and respect Retry-After when retries are
enabled. Do not use native fetch or add a Mapbox HTTP wrapper SDK for this small adapter. See
[ofetch documentation](https://github.com/unjs/ofetch).

### Credential sources and precedence

The interface supports both native Directus settings and per-field interface options:

1. Nonempty `mapboxKey` interface option overrides the global key.
2. Otherwise use `directus_settings.mapbox_key` from the hydrated Data Studio settings store,
   accessed through the extension SDK's `useStores()`.
3. If neither is available, show a configuration message and do not send search/map requests.

Use the resolved public token for both geocoding and map rendering. `credentialSource` can
explicitly select `auto` (default), `settings`, or `interface`; an explicit source must not silently
fall back to another credential. This supports a project-wide key with optional field-specific
overrides.

The native map uses `settingsStore.settings?.mapbox_key` and initializes a browser Mapbox geocoder
with it. The settings store hydrates via `/settings`. Reuse the existing Studio-readable setting; do
not add a credential endpoint, custom settings field, admin-only lookup, or environment token.
Handle settings hydration and runtime changes reactively. Verify ordinary Studio-user access on the
supported release, without assuming access for anonymous or share-link users. Reviewed upstream
[map interface](https://github.com/directus/directus/blob/8e140f94250834cea0a0fb6eb822cac39ed9faec/app/src/interfaces/map/map.vue)
and
[settings store](https://github.com/directus/directus/blob/8e140f94250834cea0a0fb6eb822cac39ed9faec/app/src/stores/settings.ts).

Only browser-public Mapbox tokens belong in these locations. They are observable in the browser;
never store secret-scope tokens there, in address values, or in operation configuration. Use least
privilege and allowed Studio-origin restrictions. See
[Mapbox token guidance](https://docs.mapbox.com/help/dive-deeper/access-tokens/).

### Why there is no geocoding endpoint

The earlier endpoint proposal was for hiding a server token and centrally proxying/rate-limiting
requests. With Studio-readable public tokens, a browser API call is sufficient. The bundle therefore
contains no geocoding endpoint. All three operations work offline using the payload they receive.

Directus documentation recommends an internal endpoint when external calls are blocked by CSP. For
this design, configure the required Mapbox origins and worker/style directives instead. Confirm
browser CORS, origin-restricted tokens and the exact CSP settings on the supported Directus version.
Do not disable CSP broadly. A future requirement for secret credentials or centralized quota control
would justify reconsidering a proxy as a separately scoped addition. See
[Directus interfaces](https://directus.com/docs/guides/extensions/app-extensions/interfaces) and
[Mapbox CSP guidance](https://docs.mapbox.com/mapbox-gl-js/guides/security-and-testing/).

### Geometry and rendering tools

Candidate browser dependency: `mapbox-gl`, with required CSS and controlled loading. Evaluate bundle
size and SDK support for lazy loading. Follow
[Mapbox GL JS setup](https://docs.mapbox.com/mapbox-gl-js/guides/get-started/).

Evaluate focused Turf modules for bbox, area, validity, containment and point grids, plus `proj4`
for documented regional projections. [Turf centroid](https://turfjs.org/docs/api/centroid) is a
vertex mean; [centerOfMass](https://turfjs.org/docs/api/centerOfMass) uses a polygon formula. Audit
projection and hole behavior before choosing a helper.
[pointGrid](https://turfjs.org/docs/api/pointGrid) returns Point features and accepts a mask, but
its allocation/boundary behavior must satisfy our limits. A bounded iterator may be necessary. See
[Proj4js](https://proj4js.org/).

ofetch remains the selected future HTTP client; it is not imported or declared as a runtime
dependency in the empty scaffold. SDK/Vue development dependencies are declared for scaffolding.
Before adding other dependencies, demonstrate the minimal set's value and obtain the
repository-required approval. Use exact catalog pins and an isolated installation; do not modify the
primary checkout's `node_modules` during this spec task.

## Address value contract

Attach the interface to a nullable JSON field. Emit a versioned normalized object rather than the
entire upstream response or a display string. Illustrative permanent-mode value:

```json
{
  "schemaVersion": 1,
  "provider": "mapbox",
  "providerApi": "geocoding-v6",
  "mapboxId": "provider-feature-id",
  "featureType": "address",
  "formattedAddress": "Example Street 10, Example City",
  "geometry": { "type": "Point", "coordinates": [4.9041, 52.3676] },
  "components": {
    "address": "Example Street 10",
    "street": "Example Street",
    "houseNumber": "10",
    "city": "Example City",
    "postcode": null,
    "municipality": null,
    "district": null,
    "region": null,
    "country": "Example Country",
    "countryCode": null
  },
  "language": "en",
  "storageMode": "permanent"
}
```

For `permanent=false`, set `storageMode` to `temporary`. This is descriptive provenance, not a
signed guarantee. Never put the token, full request URL, or unneeded response data in the value.
Keep postal codes and house numbers as strings. Coordinates are finite WGS84 longitude/latitude
pairs. Country codes normalize to uppercase ISO alpha-2 when available; missing components are null.

Map `formattedAddress` from `properties.full_address`; use the appropriate v6 address/context
properties for components. Default city to `context.place.name`. Administrative hierarchy varies by
country, so do not claim that `place` always identifies an authoritative municipality. The interface
exposes configurable component source paths/fallback lists and address formatting, with nullable
municipality by default. Never derive missing administrative facts by parsing display strings. Test
Dutch and international fixtures. See
[v6 context definitions](https://docs.mapbox.com/api/search/geocoding/#the-context-object).

Use strict Zod schemas for our versioned values and options; validate required provider properties
while tolerating new upstream fields. Unsupported schema versions and malformed values must produce
an actionable error. No Google compatibility adapter in this scope.

## Mapbox address interface

ID: `geo-mapbox-address-interface`. Display name: **Mapbox Address**.

| Option                                         | Default                              | Contract                                                            |
| ---------------------------------------------- | ------------------------------------ | ------------------------------------------------------------------- |
| `credentialSource`                             | `auto`                               | `auto`, `settings`, or `interface`; precedence as above.            |
| `mapboxKey`                                    | unset                                | Public token override; required when source is `interface`.         |
| `permanent`                                    | `true`                               | Pass true/false to v6; record response provenance.                  |
| `language`                                     | `en`                                 | Supported Mapbox language tag(s).                                   |
| `countries`                                    | unrestricted                         | Optional ISO alpha-2 country list.                                  |
| `featureTypes`                                 | `["address"]`                        | Valid v6 types; enabling other types permits incomplete components. |
| `autocomplete`                                 | `true`                               | Mapbox request option.                                              |
| `minQueryLength`                               | 3                                    | Nonnegative integer; empty query never sends requests.              |
| `debounceMs`                                   | 300                                  | Nonnegative integer.                                                |
| `resultLimit`                                  | 5                                    | Integer 1–10, the provider's bound.                                 |
| `proximity`, `bbox`                            | unset                                | Valid geographic bias/restriction.                                  |
| `worldview`                                    | `us`                                 | Supported Mapbox value.                                             |
| `requestTimeoutMs`                             | 5000                                 | Positive finite timeout.                                            |
| `retry`, `retryDelayMs`                        | 0, 500                               | Nonnegative retry count and delay.                                  |
| `componentSources`                             | v6 adapter defaults                  | Ordered safe property paths per component; municipality unset.      |
| `addressTemplate`                              | `{street} {houseNumber}`             | Named component placeholders; no evaluated code.                    |
| `styleUrl`                                     | `mapbox://styles/mapbox/streets-v12` | Valid supported style URL.                                          |
| `showMap`, `mapHeightPx`                       | true, 300                            | Textual selection still works when the map is hidden/unavailable.   |
| `defaultCenter`, `defaultZoom`, `selectedZoom` | `[0, 0]`, 2, 15                      | Valid map view settings.                                            |
| `allowClear`                                   | true                                 | Emit null on an explicit clear.                                     |

Search and select using a keyboard-accessible list; selection emits the normalized value and moves
one marker. Typing alone does not replace the current value. Reopening a saved value renders without
re-geocoding. Do not automatically select the first result or allow marker dragging to detach the
coordinates from the address. Respect `disabled` and `nonEditable`, abort stale requests, avoid
emitting on mount/external value changes, and dispose maps/listeners/workers on unmount. Show
meaningful no-results/configuration/network messages, retain attribution, and support map resize.
Changing the token/permanent/search options invalidates pending searches and transient candidates;
it does not relabel or mutate an already saved value. Never log tokens or address queries by
default.

## Shared operation contract

All operations are side-effect-free payload transforms. No `mode`, `persist`, `itemKeys`, database
reads/writes, optimistic locks, or `emitEvents` configuration. Preserve every unrelated input field
and return the complete input plus derived values, without diagnostic wrappers. Do not mutate the
supplied object in place.

| Common option  | Default                  | Contract                                                                                           |
| -------------- | ------------------------ | -------------------------------------------------------------------------------------------------- |
| `payload`      | `{{ $trigger.payload }}` | Resolved object or array of objects to transform; bind a previous operation's result for chaining. |
| `collection`   | unset                    | Optional authoring context for field pickers; never triggers a record read/write.                  |
| `inputField`   | operation-specific below | Direct source field key within each payload.                                                       |
| output mapping | operation-specific below | Direct destination keys; null/unset mapping disables that output.                                  |
| `overwrite`    | `replace`                | `replace`, `fill-empty`, or `preserve-input`; policy below.                                        |
| `missingInput` | `skip`                   | `skip` returns the complete input unchanged; `error` rejects.                                      |
| `nullInput`    | `clear`                  | `clear`, `skip`, or `error`.                                                                       |
| `maxItems`     | 100                      | Configurable positive integer batch bound.                                                         |

`replace` writes each configured derived value into the returned object. `fill-empty` only fills
null/undefined/empty-string destinations; zero and false are not empty. `preserve-input` fills only
destinations absent from the supplied payload, preserving explicitly supplied overrides. These
policies operate on the input payload, not unseen persisted values. Clearing follows the chosen
overwrite policy. An invalid present source always rejects; it is distinct from absent or null.

`payload` accepts one object or an array; return the same shape and order. Validate the entire batch
before returning, with errors identifying the item index. Configurable bounds have defaults, not
hidden hard caps at those defaults. Validate positive finite values and integer counts; refuse
unsafe arithmetic, impossible allocation or unsupported algorithms rather than silently clamping.

Use optional collection context for field/type suggestions; direct-key configuration works without
it. Reject duplicate destinations, prototype-pollution keys, source/destination collisions, and
unsupported nested/relational paths. Schema-aware authoring should flag incompatible output fields;
Directus remains responsible for validating the returned item payload, permissions and persistence.
Do not bypass that validation or strip the original payload's other fields.

### Filter Flow setup and chaining

Use Event Hook **Filter (Blocking)** for item create/update. First operation: bind `payload` to
`{{ $trigger.payload }}`. Later operations: explicitly bind to the previous operation's returned
payload, e.g. `{{ geo_extract }}`. Each operation returns an ordinary item object (or batch), not a
Flow data-chain object. Select **Data of Last Operation** as the filter Flow's Response Body, or
select the final operation key. Returning All Data would replace the item with the entire data
chain. See [Directus Flow triggers](https://directus.com/docs/guides/flows/triggers).

Create filters do not require an existing primary key. Update payloads can be partial: if a source
field is absent, skip by default and preserve the partial payload. Do not fetch the stored source.
If a caller needs existing values it can explicitly supply/merge them upstream, preserving the
intended payload semantics. A reject branch that handles an error must deliberately return the
original item payload or reject the Flow; it must not accidentally return an error wrapper as item
content. No extra item-update event is emitted by these transforms.

Example extraction input: `{ "title": "Office", "address_data": <normalized address> }`. Default
output includes the original title/address_data plus the mapped components and Point. A later
centroid transform extends that same object; Directus writes the final filter response.

## Extract geolocation operation

ID: `geo-extract-geolocation-operation`. Display name: **Extract Geolocation Data**.

| Option                | Default        | Contract                                                            |
| --------------------- | -------------- | ------------------------------------------------------------------- |
| `inputField`          | `address_data` | Normalized address JSON source.                                     |
| `outputs`             | mappings below | Enable, disable or rename each destination independently.           |
| `missingComponent`    | `null`         | `null`, `skip`, or `error`; apply before overwrite policy.          |
| `countryCodeCase`     | `upper`        | `upper`, `lower`, or `preserve`.                                    |
| `coordinatePrecision` | 8              | Configurable integer 0–15 decimal places for numeric/Point outputs. |

Default outputs: `formattedAddress -> formatted_address`, `address -> address`, `street -> street`,
`houseNumber -> house_number`, `city -> city`, `postcode -> postal_code`,
`municipality -> municipality`, `district -> district`, `region -> region`, `country -> country`,
`countryCode -> country_code`, `longitude -> longitude`, `latitude -> latitude`,
`point -> location_geopoint`. Every mapping is editable or disableable; configuration suggestions do
not create fields.

Extract normalized components without network calls. Text values stay strings, coordinates are
numeric, and `point` is GeoJSON geometry, not a Feature or WKT string. Explicit null source clears
mapped outputs subject to policy. Missing components use the selected policy so operators can choose
clearing, omission or rejection. Keep component interpretation in the interface's versioned
normalizer; extraction must not invent municipality data or repeat geocoding.

## Shared geometry options

Both geometry operations expose these options in addition to their own settings:

| Option                                | Default            | Contract                                                                        |
| ------------------------------------- | ------------------ | ------------------------------------------------------------------------------- |
| `maxVertices`                         | 1000               | Configurable positive integer total across rings, excluding closing duplicates. |
| `maxAreaKm2`                          | 100000             | Configurable positive finite area bound.                                        |
| `maxLongitudeSpan`, `maxLatitudeSpan` | 10, 10 degrees     | Configurable regional envelope bounds.                                          |
| `latitudeRange`                       | `[-80, 80]`        | Configurable valid WGS84 latitude interval.                                     |
| `projection`                          | `local-equal-area` | Verified local projection preset or explicit supported projection definition.   |
| `projectionCenter`                    | auto from bbox     | Optional explicit longitude/latitude center.                                    |
| `coordinatePrecision`                 | 8                  | Integer 0–15 decimal places.                                                    |
| `geometryToleranceMeters`             | 0.01               | Nonnegative tolerance for projected topology/boundary decisions.                |

Accept Polygon geometry or a Feature containing Polygon, closed rings with at least four positions
and three distinct vertices, finite 2D WGS84 coordinates and nonzero area. Validate contained,
nonintersecting holes and reject self-intersections. Do not silently repair or simplify inputs.
Structural correctness, valid coordinate ranges and supported geometry types are invariants, not
switches. MultiPolygon, antimeridian crossing and unimplemented projection definitions remain
unsupported in v1; raising a size limit does not enable those capabilities. Validate any customized
regional envelope against the chosen projection's supported accuracy before claiming it is
supported.

## Calculate centroid operation

ID: `geo-calculate-centroid-operation`. Display name: **Calculate Polygon Centroid**.

| Option                      | Default               | Contract                                                                            |
| --------------------------- | --------------------- | ----------------------------------------------------------------------------------- |
| `inputField`, `outputField` | `polygon`, `centroid` | Editable source and Point destination; return original payload plus destination.    |
| `method`                    | `projected-area`      | `projected-area` or `spherical-vertex`; explicit distinct semantics.                |
| `holes`                     | `subtract`            | `subtract` or `reject`; spherical-vertex requires `reject` for polygons with holes. |

Recommended default: area-weighted centroid in the configured equal-area projection, subtracting
holes independently of winding, then inverse-projecting to WGS84. Verify the selected projection and
ring formula. Extra collinear vertices and reversed winding must not materially change the area
centroid. A concave polygon's centroid can be outside it or inside a hole; do not silently replace
it with a point-on-surface. This is a centroid relative to the documented projection, not an exact
global ellipsoidal centroid.

The configurable `spherical-vertex` method averages the outer ring's unit-sphere vertex vectors,
excluding the duplicate closing vertex. It is useful for reproducing the earlier kind of spherical
calculation, but is not an area centroid or exact legacy parity. Reject degenerate vector sums.
Document method differences and test numeric tolerances. Return Point geometry in the mapped field;
null-input behavior comes from common options. No operation writes the database itself.

## Polygon grid points operation

ID: `geo-polygon-grid-points-operation`. Display name: **Calculate Polygon Grid Points**.

| Option                                             | Default                  | Contract                                                                     |
| -------------------------------------------------- | ------------------------ | ---------------------------------------------------------------------------- |
| `inputField`, `outputField`                        | `polygon`, `grid_points` | Editable source and MultiPoint destination within returned payload.          |
| `spacing`, `units`                                 | 8, `kilometers`          | Positive finite distance; `meters` or `kilometers`.                          |
| `maxPoints`, `maxCandidates`                       | 500, 10000               | Separate configurable positive integer output/work bounds.                   |
| `origin`                                           | `bbox`                   | `bbox` or explicit projected-coordinate origin.                              |
| `offsetX`, `offsetY`                               | 0.5, 0.5 cells           | Configurable lattice offsets in [0, 1).                                      |
| `rotationDegrees`                                  | 0                        | Finite grid rotation relative to projected axes.                             |
| `includeBoundary`                                  | false                    | Explicit exterior/hole boundary policy using shared tolerance.               |
| `minimumBoundaryDistance`, `minimumVertexDistance` | 0, 0                     | Nonnegative clearance in configured units; independent options.              |
| `adaptiveSpacing`                                  | false                    | If true, recompute the complete grid at a coarser spacing to satisfy limits. |
| `maxAdaptiveIterations`, `adaptiveFactor`          | 10, 1.5                  | Positive iteration bound; finite factor greater than 1.                      |
| `emptyResult`                                      | `null`                   | `null`, `empty-multipoint`, or `error`; validate destination support.        |

Generate a deterministic lattice in the configured projection; inverse-project candidates and filter
against the polygon including holes. Order points by lattice row/column. Spacing is regular in
projected coordinates, not exact ground distance everywhere. Account for rotation when computing
candidate extent/count. An explicit origin permits consistent alignment across adjacent polygons.

Estimate work before allocation. Exceeded limits reject by default rather than truncate. With
adaptive spacing enabled, increase spacing deterministically, recompute full counts/grid, and stop
at the configured iteration bound. Do not scan only the first N candidates. The final geometry
contains only coordinates, with no diagnostic fields; report effective spacing/counts through safe
logs, not a wrapper that would pollute the filter payload.

Boundary clearance measures distance to every ring's segments, including holes; vertex clearance is
a separate option and is not a substitute. Empty results follow `emptyResult`, rather than an
implicit driver-dependent choice. Return `{ "type": "MultiPoint", "coordinates": [...] }` under the
configured field with the complete original input. No random distributions or hex-grid mode.

## Legacy reference and compatibility

Reviewed the supplied
[geospatial README](https://github.com/onderwijsin/onderwijsloket-directus/blob/e5c2c15cd7911293484cb02675a4366efd29ee7f/directus/extensions/geospatial/README.md)
and
[areaHook.ts](https://github.com/onderwijsin/onderwijsloket-directus/blob/e5c2c15cd7911293484cb02675a4366efd29ee7f/directus/extensions/geospatial/src/areaHook.ts)
at commit `e5c2c15cd7911293484cb02675a4366efd29ee7f` on `next`.

| Subject        | Legacy behavior                                                 | New contract                                                        |
| -------------- | --------------------------------------------------------------- | ------------------------------------------------------------------- |
| Invocation     | Hooks and fixed collection/field names                          | Configurable filter Flow payload transforms.                        |
| Address source | Google-derived value described in README                        | Versioned Mapbox v6 normalized value.                               |
| Centroid       | Outer-ring spherical vertex mean, including closing duplicate   | Configurable projected-area/spherical-vertex method.                |
| Limits         | Source: 1000 vertices, 100000 km² bbox estimate; README differs | Configurable, separately defined limits.                            |
| Grid count     | Stops after 500 examined candidates                             | Separate output/candidate limits and explicit adaptation.           |
| Containment    | Outer ring only; 8 km vertex exclusion                          | Hole-aware containment with configurable boundary/vertex clearance. |

This package is not a drop-in replacement for the hooks. Legacy migrations require explicit field
mapping and comparisons of derived values. Do not change the existing hooks as part of this work.

## Acceptance and validation

Scaffold acceptance: four active registrations with matching operation app/API IDs and existing
entrypoint files; empty interface/operation behavior; required build/typecheck metadata; private
manifest, README, consumer skill, license and changelog. No endpoint, runtime provider/geometry
dependencies or implemented business logic. Reserved modules export nothing. Dependency metadata and
the lockfile must agree; no primary-checkout dependency installation is allowed.

Implementation acceptance:

- Interface: both credential sources/precedence, non-admin Studio settings access, hydration, token
  changes, permanent true/false request parameters and truthful provenance, all option defaults,
  selection/clear/disabled states, attribution, CSP, stale responses, resize and unmount.
- Provider: ofetch query/abort/timeout/retry behavior, no hidden retries, v6 normalization, missing
  context, international formats, configurable component paths, and no tokens/queries in logs.
- Transforms: unrelated fields preserved, no input mutation, complete return shape, arrays, partial
  update payloads, absent/null/invalid distinctions, overwrite policies, configurable mappings,
  prototype-key rejection, all default/overridden limits and no database/network calls.
- Centroid: known shapes, holes, concavity, winding, collinear insertion, spherical degeneracy,
  precision/tolerance, method/projection changes, envelope boundaries and invalid geometry.
- Grid: spacing/units, origin/offset/rotation, deterministic order, holes, boundary inclusion,
  independent edge/vertex clearance, bounded allocation, explicit adaptation and empty-result
  policy.
- Directus: packed four-entry loading, create/update blocking filter response roundtrip, chained
  operations, partial updates, permission/schema validation and actual Point/MultiPoint driver
  support.

CI uses deterministic Mapbox mocks/synthetic fixtures, not live billable requests. Use repository
unit/component/E2E suffixes and fixture/cleanup contracts. Test known contracts rather than coverage
thresholds. Confirm each supported configurable option is honored and shown in the operation
summary.

Run repository formatting, lint, typecheck, unit and documentation checks, plus the bundle build.
Use isolated dependencies to validate the scaffold without modifying primary-checkout node_modules.
The current build/typecheck cover registrations and empty modules, not planned geodata behavior. Add
contract tests with implementation rather than creating empty tests. Packed-consumer loading and
Directus E2E remain required for runtime compatibility claims. Report blocked or skipped checks
explicitly. Public package validation applies when the package is made publishable.

## Implementation sequence and release gates

1. Finalize typed option schemas, configurable defaults, projection support and numeric tolerances.
   Validate Mapbox account eligibility, native settings availability and browser CSP on supported
   hosts.
2. Add approved runtime catalog dependencies in an isolated checkout; implement/test the reserved
   schemas/transforms and fill out the registered app/API options and handlers. The scaffold already
   uses vue-tsc for its Vue source.
3. Implement the browser ofetch adapter and address interface with settings/option credential
   resolution and permanent configuration; no supporting geocoding endpoint.
4. Verify packed loading and filter Flow behavior; reconcile README, installable consumer skill,
   changelog, license, root README and package publication metadata before making the package
   public. Add correctly scoped public-package Changesets at that stage.

The required options are behavioral knobs with validated defaults. They do not make unsupported
GeoJSON types, invalid topology, unrestricted executable templates or provider-imposed bounds
configurable. Future additions may include MultiPolygon, authoritative municipality enrichment,
point-on-surface and alternate address providers.
