# Geo Toolkit for Directus

`@onderwijsin/directus-geo-toolkit-bundle` brings address entry, address extraction and polygon
calculations to Directus. Use its interface and Flow operations independently or combine them to
capture locations and derive geographic fields.

## Included extensions

| Extension                                                       | Type      | Use it to                                                                        |
| --------------------------------------------------------------- | --------- | -------------------------------------------------------------------------------- |
| [Mapbox Address](#mapbox-address)                               | Interface | Search for an address and save a structured value in a JSON field.               |
| [Extract Geolocation Data](#extract-geolocation-data)           | Operation | Turn a saved Mapbox or Google address into text fields, coordinates and a Point. |
| [Calculate Polygon Centroid](#calculate-polygon-centroid)       | Operation | Derive an area-weighted or spherical vertex centroid as a Point.                 |
| [Calculate Polygon Grid Points](#calculate-polygon-grid-points) | Operation | Generate interior points with spacing that adapts to a minimum/maximum count.    |

Registration IDs are `geo-mapbox-address-interface`, `geo-extract-geolocation-operation`,
`geo-calculate-centroid-operation` and `geo-polygon-grid-points-operation`, respectively.

Only Mapbox Address requires a Mapbox account and public token. All three operations work offline on
the incoming payload and need no provider credentials. Extract Geolocation Data also supports
addresses saved by Directus Labs Address Completion; the polygon operations consume GeoJSON.

## Installation and compatibility

The package is currently private and has not been released to npm. Build it from this workspace:

```sh
pnpm --filter @onderwijsin/directus-geo-toolkit-bundle build
```

Load the built package into a trusted Directus server using the workspace extension mount, then
reload or restart Directus. Supported versions are Directus `>=12.2.0 <13` and Node `>=24.10.0`. The
operations are non-sandboxed and require a host that permits trusted API extensions.

Configure the fields and Flows you need after loading the bundle. It does not create collections,
fields, Flows, hooks, provider accounts or credentials. Directus controls permissions, field
validation and persistence. WebGL and Mapbox browser connections are requirements of the optional
address map; they are unnecessary for the Flow operations.

## Flow transforms

Every operation returns the complete incoming item with derived fields added according to its
options. Unrelated fields and the source value are preserved. Arrays return an array in the same
order. Operations do not fetch existing records, write to the database or mutate the input.

To enrich an item before Directus saves it:

1. Create the source and destination fields in your collection.
2. Create an Event Hook **Filter (Blocking)** Flow for item create/update.
3. Add the desired operation and bind `payload` to `{{ $trigger.payload }}`.
4. When chaining, bind each subsequent operation's `payload` to the preceding operation's key, for
   example `{{ center }}`. Each operation then receives all fields added so far.
5. Set the Flow Response Body to **Data of Last Operation**, or the intended operation's key.

See [Directus filter triggers](https://directus.com/docs/guides/flows/triggers).

### Shared Flow options

| Option                | Default                  | Behaviour                                                                                                                                             |
| --------------------- | ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `payload`             | `{{ $trigger.payload }}` | Resolved item object or array. Bind a previous operation's result when chaining.                                                                      |
| `overwrite`           | `replace`                | `replace` overwrites destinations; `preserve-input` only adds absent keys; `fill-empty` fills null, undefined or empty strings.                       |
| `missingInput`        | `skip`                   | Entire source field absent/undefined: `skip` returns the item unchanged; `error` rejects.                                                             |
| `nullInput`           | `clear`                  | Entire source field null: `clear` writes null to enabled destinations subject to overwrite policy; `skip` leaves the item unchanged; `error` rejects. |
| `coordinatePrecision` | `8`                      | Integer 0–15 decimal places in output coordinates.                                                                                                    |

Overwrite policies inspect only the incoming payload. Existing database values absent from a partial
update are not consulted. `preserve-input` preserves explicitly supplied null and empty strings as
well as populated values. For extraction, `missingComponent` separately controls absent components
within an otherwise valid address.

Source and destination keys must be direct field names, with destinations distinct from the source.
Nested paths and prototype keys are rejected. Operations do not consult the collection schema or
create fields: configure destinations that exist and have the appropriate Directus types.

Invalid options, malformed items and invalid present sources reject the operation. Every item in an
array is processed without batching or an item-count limit. Batch errors identify the item index; no
partial batch is returned. Polygon complexity and grid candidate limits apply separately.

## Extract Geolocation Data

Reads a saved address and adds address components, latitude, longitude and/or a GeoJSON Point to the
payload. It accepts both the Geo Toolkit Mapbox value and the Google-backed Directus Labs Address
Completion value. Provider credentials are unnecessary for extraction.

Use the [shared Flow options](#flow-transforms) together with these extraction options:

| Option             | Default        | Behavior                                                                                                                                      |
| ------------------ | -------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `inputField`       | `address_data` | Direct field containing the saved address.                                                                                                    |
| `outputs`          | mappings below | In a supplied object, omitted keys and falsy values (null, false, 0, empty string) disable outputs. Leaving outputs unset uses all defaults.  |
| `missingComponent` | `null`         | A valid address lacks an enabled component: null writes null, skip leaves its destination unchanged, error rejects; applied before overwrite. |
| `countryCodeCase`  | `upper`        | `upper`, `lower` or `preserve`.                                                                                                               |

### Output fields

Default mappings: `formattedAddress → formatted_address`, `address → address`, `street → street`,
`houseNumber → house_number`, `city → city`, `postcode → postal_code`,
`municipality → municipality`, `district → district`, `region → region`, `country → country`,
`countryCode → country_code`, `longitude → longitude`, `latitude → latitude`,
`point → location_geopoint`. Extraction destinations must also be unique. Directus 12.2 ignores
nonexistent collection fields when persisting the returned payload; existing fields remain subject
to type validation and permissions.

### Supported address sources

Supported sources are the version-one Geo Toolkit Mapbox value and the GeoJSON Point Feature saved
by
[Directus Labs Address Completion](https://github.com/directus-labs/extensions/tree/main/packages/address-completion-interface).
Google values use `properties.formated` (the upstream spelling), `raw` components with
`longText`/`shortText`/`types`, and the saved country/postalCode/administrativeArea properties.
`route` and `street_number` supply the street address; `locality` supplies city;
`administrative_area_level_2` supplies district and level 1 supplies region. Municipality stays
null: no authoritative municipality is inferred. Country names use the raw country component; codes
use the saved country code. Missing values follow `missingComponent`.

### Native Map field output

To populate a native Directus Map field, create a **Point** (`geometry.Point`) field with the
**Map** interface (`map`). The `point` output defaults to `location_geopoint`; set
`"outputs": { "point": "geopoint" }` if your field is named `geopoint`. It writes GeoJSON geometry
such as `{ "type": "Point", "coordinates": [4.5665234, 51.9332112] }`. Use a spatially supported
database such as PostgreSQL with PostGIS. See
[Directus Map interface](https://directus.com/docs/guides/data-model/interfaces#map).

Text remains text, including postal codes and house numbers. Unsupported saved versions and
malformed addresses reject the operation.

### Example

Preserve every explicitly supplied destination, including null and empty strings:

```json
{
  "payload": "{{ $trigger.payload }}",
  "inputField": "address_data",
  "overwrite": "preserve-input",
  "outputs": {
    "street": "street_name",
    "postcode": "postal_code",
    "point": "location_geopoint",
    "municipality": null
  }
}
```

For `{ "title": "Office", "address_data": <saved address>, "city": "Manual city" }`, this returns
the original title/source/city plus extracted outputs such as `street_name`, `postal_code` and
`location_geopoint`. The interface continues to update only its own JSON field; configure this
operation to populate separate columns.

## Polygon transforms

Both polygon operations accept a GeoJSON Polygon geometry or a Feature containing one. Coordinates
use `[longitude, latitude]`. Create a Polygon source field and Point/MultiPoint destinations with
the native Directus Map interface, using a spatially supported database such as PostgreSQL with
PostGIS. The calculations run locally and are independent of the address interface.

### Polygon input and limits

| Option        | Default                    | Behavior                                                                            |
| ------------- | -------------------------- | ----------------------------------------------------------------------------------- |
| `inputField`  | `polygon`                  | Direct key containing Polygon geometry or a Polygon Feature.                        |
| `outputField` | `centroid` / `grid_points` | Existing Point / MultiPoint destination. Must differ from the source key.           |
| `maxVertices` | `1000`                     | Total across all rings, excluding their closing duplicates. Larger polygons reject. |
| `maxAreaKm2`  | `100000`                   | Positive approximate bounding-box area limit in km²; larger polygons reject.        |

Present invalid source values reject even when overwrite would preserve a supplied destination.
Rings must be closed, nonzero in area and nonintersecting; holes must lie inside the exterior and
cannot touch, intersect or contain one another. MultiPolygon and antimeridian-crossing polygons are
unsupported. Invalid geometry is never silently repaired.

## Calculate Polygon Centroid

Adds a GeoJSON Point to the payload, defaulting to `centroid`. Set `outputField` to use another
destination. Apply the shared Flow and polygon options above.

`method` defaults to `projected-area`: an area-weighted centroid in a spherical Lambert azimuthal
equal-area projection centred on the polygon bounding box. Holes are subtracted regardless of
winding. This is a centroid of the projected polygon, rather than an exact ellipsoidal centroid. A
concave polygon's centroid may lie outside the polygon or inside a hole.

Set `method=spherical-vertex` to average the exterior vertices as unit-sphere vectors. The duplicate
closing vertex is excluded. This method rejects holes and undefined vector sums; unlike area
weighting, adding extra vertices changes the result.

Example operation options preserving an explicit incoming centroid override:

```json
{
  "payload": "{{ $trigger.payload }}",
  "inputField": "area_bounds",
  "outputField": "area_center",
  "method": "projected-area",
  "overwrite": "preserve-input"
}
```

## Calculate Polygon Grid Points

Adds a GeoJSON MultiPoint to the payload, defaulting to `grid_points`, or returns the configured
empty result in that field. Apply the shared Flow and polygon options above.

The grid uses the same built-in local equal-area projection; there is no projection or rotation
configuration. Positions start half a cell inside the projected bounding box and are returned in
row/column order. Spacing and clearance are measured in projected coordinates and approximate ground
distances; they are intended for regional polygons. Exterior and hole boundaries are excluded.
Returned coordinates are checked again after rounding so precision cannot move points into holes,
onto boundaries or inside the requested clearance. Duplicate rounded coordinates are removed.

| Option                    | Default      | Behavior                                                                                                                                            |
| ------------------------- | ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `spacing`                 | `8`          | Initial spacing, adjusted when needed to meet the point-count range.                                                                                |
| `units`                   | `kilometers` | `kilometers` or `meters`; applies to spacing and both clearance distances.                                                                          |
| `minPoints`               | `0`          | Decrease spacing when fewer points are found. Zero permits an empty result.                                                                         |
| `maxPoints`               | `500`        | Increase spacing when too many points are found. Output is never truncated. Must be at least minPoints.                                             |
| `maxCandidates`           | `10000`      | Candidate positions scanned per spacing attempt; estimated before scanning. Must be at least maxPoints. Too many candidates causes coarser spacing. |
| `minimumBoundaryDistance` | `0`          | Nonnegative clearance from every exterior and hole segment. Boundaries themselves are always excluded.                                              |
| `minimumVertexDistance`   | `0`          | Independent nonnegative clearance from every ring vertex. Measured in the selected units.                                                           |
| `emptyResult`             | `null`       | `null`, `empty-multipoint` or `error`; applies only if zero satisfies minPoints. Check database support before choosing an empty MultiPoint.        |

The operation recomputes the grid while adjusting spacing, up to 32 attempts. It returns a complete
grid within minPoints/maxPoints or rejects if the requested count cannot be reached within the
candidate limit, clearance and coordinate precision. Tight count ranges can be unattainable because
a regular lattice has discrete counts. Large clearance can make every candidate invalid. No partial
grid is returned and no diagnostics are added to the item payload.

Example chained after an operation whose key is `center`, generating between 20 and 100 points:

```json
{
  "payload": "{{ center }}",
  "inputField": "area_bounds",
  "outputField": "area_inner",
  "spacing": 8,
  "units": "kilometers",
  "minPoints": 20,
  "maxPoints": 100,
  "minimumVertexDistance": 8,
  "overwrite": "preserve-input"
}
```

## Mapbox Address

Search for an address and save its structured value in a nullable JSON field. This interface updates
only that field; use Extract Geolocation Data when you also need separate address or Point columns.

### Set up the interface

1. Create or choose a nullable JSON field and select **Mapbox Address**
   (`geo-mapbox-address-interface`).
2. Configure a browser-public Mapbox token in Directus project settings
   (`directus_settings.mapbox_key`) or in the interface's **Public Mapbox key** option.
3. Allow the required Mapbox connections/workers in the Studio's Content Security Policy.
4. Type an address, choose a result with the pointer or Arrow keys followed by Enter, then save the
   item through Directus. Enter alone does not silently select the first result.

Search sits at the map's top-left, or works on its own when the map is hidden. Selecting a result
updates the map's center, zoom and marker. Country and language remain configurable; use
`countries=["NL"]` and `language="nl"` for Dutch address entry.

Typing only changes the search query; choosing a result emits the normalized JSON field value.
**Clear** explicitly emits null when `allowClear` is enabled. Disabled fields cannot search or
clear; noneditable fields retain their styling and hide mutation controls. Mounting, focusing,
reopening or receiving an external field update does not geocode or emit an edit. The map retains
its built-in attribution.

### Mapbox credentials

A nonempty interface `mapboxKey` overrides the native Studio settings key. Empty overrides fall back
to `directus_settings.mapbox_key`. Settings hydration and key changes are reactive. Only `pk.`
browser-public tokens are accepted; secret-scope `sk.` tokens are rejected. Public tokens are
visible in browser requests by design. Restrict tokens to the intended Studio origins, keep scopes
minimal, and never put secret credentials in these fields.

Address search calls Mapbox Geocoding API v6 from the browser. Configure credentials through the
Studio setting or field option; no server environment configuration is required.

#### Token permissions and account requirements

Use a browser-public token beginning with `pk.`. For the default Light/Dark v11 maps, enable:

| Scope         | Used for                                     |
| ------------- | -------------------------------------------- |
| `styles:read` | Loading the Mapbox style and its map assets. |
| `fonts:read`  | Loading font glyphs for map labels.          |

Geocoding v6 requires a valid access token but no additional geocoding-specific scope. The interface
does not need dataset access, SDK download permissions, or any secret/write scopes. `styles:tiles`
is only needed if a custom style setup requests rendered raster style tiles through Mapbox's Static
Tiles API; the default map does not use that API. See
[Mapbox token scopes](https://docs.mapbox.com/accounts/guides/tokens/#scopes) and
[Geocoding authentication](https://docs.mapbox.com/api/search/geocoding/#forward-geocoding-with-search-text-input).

Permanent geocoding is an account entitlement, not a token scope: Mapbox requires a valid credit
card on file or an active enterprise contract. See
[permanent result storage](https://docs.mapbox.com/api/search/geocoding/#storing-geocoding-results).

Create a dedicated public token and add the actual Directus Studio URLs to its allowed URLs,
including the hostname and port used for local development. Use explicit URLs rather than wildcard
patterns. URL-restricted tokens depend on a browser Referer header; a Studio referrer policy that
suppresses cross-origin referrers can cause 403 responses. See
[Mapbox URL restrictions](https://docs.mapbox.com/accounts/guides/tokens/#url-restrictions).

### Interface options

Every option below is available in the interface settings. Complex options use JSON editors; feature
types and countries use multiselects; language uses a dropdown. Invalid configuration displays a
safe message and disables requests. Style URLs accept `mapbox://styles/<owner>/<id>` or the
equivalent HTTPS `api.mapbox.com/styles/v1` URL without a query string or embedded token; other
style origins are not supported.

| Option                                         | Default                            | Contract                                                                  |
| ---------------------------------------------- | ---------------------------------- | ------------------------------------------------------------------------- |
| `mapboxKey`                                    | unset                              | Public token override; falls back to the native project key when empty.   |
| `permanent`                                    | `true`                             | Pass true/false to v6; record response provenance.                        |
| `language`                                     | `en`                               | Select a supported Mapbox language by name.                               |
| `countries`                                    | unrestricted                       | Country multiselect; only return results in selected countries.           |
| `featureTypes`                                 | `["address", "street", "place"]`   | Valid v6 types; enabling other types permits incomplete components.       |
| `autocomplete`                                 | `true`                             | Mapbox request option.                                                    |
| `minQueryLength`                               | 3                                  | Nonnegative integer; empty query never sends requests.                    |
| `debounceMs`                                   | 300                                | Nonnegative integer.                                                      |
| `resultLimit`                                  | 5                                  | Integer 1–10, the provider's bound.                                       |
| `proximity`                                    | unset                              | Bias toward [longitude, latitude] or "ip"; does not restrict results.     |
| `worldview`                                    | `us`                               | Regional view used for names and country context in disputed territories. |
| `componentSources`                             | v6 adapter defaults                | Ordered safe property paths per component; municipality unset.            |
| `lightStyleUrl`                                | `mapbox://styles/mapbox/light-v11` | Style used in the light Studio theme.                                     |
| `darkStyleUrl`                                 | `mapbox://styles/mapbox/dark-v11`  | Style used in the dark Studio theme.                                      |
| `styleUrl`                                     | Unset                              | Legacy override for both themes; remove it to enable theme switching.     |
| `showMap`, `mapHeightPx`                       | true, 300                          | Textual selection still works when the map is hidden/unavailable.         |
| `defaultCenter`, `defaultZoom`, `selectedZoom` | `[0, 0]`, 2, 15                    | Valid map view settings.                                                  |
| `allowClear`                                   | true                               | Emit null on an explicit clear.                                           |

`componentSources` overrides only the specified component keys. Omitted keys retain their defaults;
an empty list disables that component, including the street-address fallback. Paths are dotted
own-property paths relative to the v6 Feature, such as `properties.context.place.name`. Prototype
properties and executable expressions are disallowed. The street address uses the provider's address
when available, otherwise it joins the street and house number. No address template is needed.

Language choices include Mapbox's documented languages; coverage varies by region. Country
restrictions limit results to selected countries. United States and Netherlands are listed first,
followed by the remaining countries alphabetically. Proximity only favors nearby results. Its JSON
editor includes `[4.9041, 52.3676]` as an example; `"ip"` uses the request IP instead. Worldview
controls how Mapbox identifies disputed territories and their country context; the default is the US
view. See
[Mapbox Geocoding parameters](https://docs.mapbox.com/api/search/geocoding/#forward-geocoding-with-search-text-input).

Example field options (replace the token with a real origin-restricted public token):

```json
{
  "mapboxKey": "pk.REPLACE_WITH_PUBLIC_TOKEN",
  "permanent": true,
  "language": "nl",
  "countries": ["NL"],
  "featureTypes": ["address", "street", "place"],
  "resultLimit": 5,
  "showMap": true,
  "componentSources": {
    "city": ["properties.context.place.name", "properties.context.locality.name"]
  }
}
```

For address-and-town search, enable **Address**, **Street** and **Place** in **Result feature
types**. Existing fields retain their saved restrictions. Address-only search excludes town names
such as Soest and can return no features even for a successful request.

The configured map height is reserved while the renderer loads. Search stays inside its own field,
including when the map is loading or unavailable.

### Saved address value

Permanent geocoding defaults to true and requires an eligible Mapbox account. `permanent=false`
requests temporary results and records `storageMode=temporary`; it does not authorize retaining
those results or derived components in a database, even in development. Use synthetic fixtures for
persistence testing without permanent requests. See
[Mapbox storage rules](https://docs.mapbox.com/api/search/geocoding/#storing-geocoding-results).
Changing the option does not relabel a previous selection's provenance.

The interface emits one versioned object containing `schemaVersion=1`, `provider=mapbox`,
`providerApi=geocoding-v6`, `mapboxId`, `featureType`, `formattedAddress`, `language`,
`storageMode`, a GeoJSON Point `geometry`, and `components`. Components are `address`, `street`,
`houseNumber`, `city`, `postcode`, `municipality`, `district`, `region`, `country` and
`countryCode`. Missing components are null; postal codes/house numbers remain strings. Coordinates
use longitude before latitude, and country codes are uppercase ISO alpha-2. Raw responses, tokens
and request URLs are not stored.

The component-paths JSON editor includes city, postcode and country examples. `featureType`
identifies the selected geographic type. Keep the complete versioned value when reading or writing
this field through the API.

City defaults to Mapbox's `place` name. Municipality defaults to null; configure a source path only
when the provider's hierarchy meets your needs. A place/district name is not proof of an
authoritative municipality. Unsupported saved versions and malformed values show feedback without
silently repairing the record. The user's next explicit selection or clear can replace an invalid
saved value.

### Browser requirements and requests

For the bundled Mapbox GL JS renderer, retain the Studio's existing CSP entries and add only the
needed directives: `connect-src https://api.mapbox.com https://events.mapbox.com`,
`worker-src blob:`, and `img-src data: blob:`. The v6 search requests use
`https://api.mapbox.com/search/geocode/v6/`. Mapbox styles, fonts, tiles and session requests use
the same API origin. Narrow paths further if required by your deployment; do not disable CSP
globally. Standard/3D styles may need additional WebAssembly permissions. The default Light/Dark
styles do not opt into those features. See
[Mapbox CSP guidance](https://docs.mapbox.com/mapbox-gl-js/guides/security-and-testing/).

The map loads when `showMap` is enabled and credentials are valid. Each field uses its own resolved
token, so separate fields can use different credentials.

Requests are debounced. Superseded results are ignored when queries, settings, or editing state
change, or the component unmounts. Errors shown to users never include raw upstream error bodies,
tokens or address queries. No result cache is used. The upstream query limit is 256 characters/20
words; semicolons are rejected before sending.

### Editing behaviour and boundaries

Appearance follows the Directus user preference, project default, then browser preference for Auto.
The map reacts to theme changes without clearing the selection or resetting the viewport. The saved
address appears in the search input; coordinates remain in the saved JSON value. Loading uses an
input spinner and empty results appear in the dropdown.

The clear button appears for a saved value, including an invalid one, and clears both the value and
search text. It respects Allow clearing and read-only settings. Search-only text does not show the
button. Search Box/POI search, marker dragging, arbitrary map clicks and authoritative municipality
enrichment are not provided.

## Troubleshooting

| Symptom                                          | Check                                                                                                     |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| Derived fields are missing                       | Check the blocking filter Flow response, source field, destination fields and overwrite policy.           |
| A chained operation drops earlier outputs        | Bind its payload to the previous operation's key.                                                         |
| A partial update leaves derived fields unchanged | The source field is absent and `missingInput=skip`; operations do not read the stored record.             |
| Clearing a source leaves a destination populated | Check `nullInput` and whether the overwrite policy preserves the incoming destination.                    |
| Address extraction rejects a saved value         | Confirm it is a supported version-one Geo Toolkit value or Directus Labs Point Feature.                   |
| Polygon input is rejected                        | Check closed rings, valid holes, source type, vertex/area limits and antimeridian crossing.               |
| A centroid lies outside the polygon              | Area centroids can lie outside concave polygons or inside holes; they are not guaranteed interior points. |
| Grid cannot meet its point-count range           | Widen min/max bounds, reduce clearance, increase precision or adjust the candidate limit as appropriate.  |
| Grid returns null                                | Zero points satisfy `minPoints=0` and `emptyResult=null`; check spacing and clearance.                    |
| Mapbox key/configuration message                 | Check Studio settings hydration and the field override.                                                   |
| Mapbox request denied                            | Check token origins, scopes and permanent-geocoding account eligibility.                                  |
| No addresses found                               | Check query, countries, feature types and language.                                                       |
| Address map unavailable                          | Check WebGL, token/style, CSP and network; textual selection remains available.                           |
| Saved address invalid in the interface           | Inspect the versioned value; explicitly reselect or clear.                                                |

Use synthetic provider fixtures for persistence tests when permanent Mapbox geocoding is
unavailable. Keep credentials, address queries and raw provider error bodies out of diagnostic
output.
