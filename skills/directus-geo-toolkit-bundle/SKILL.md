---
name: directus-geo-toolkit-bundle
description:
  Configure Geo Toolkit address entry and payload extraction in Directus, including Mapbox
  credentials, normalized values, Google address Features and blocking filter Flows.
---

# Directus Geo Toolkit bundle

**Geo Toolkit** provides a Mapbox address input for Directus JSON fields. Extract Geolocation Data
transforms address payloads; the two polygon Flow operations remain scaffolds. This package remains
private and has not been released to npm.

## Installation and compatibility

Build from this workspace; no published npm installation is available yet:

```sh
pnpm --filter @onderwijsin/directus-geo-toolkit-bundle build
pnpm --filter @onderwijsin/directus-geo-toolkit-bundle dev
pnpm --filter @onderwijsin/directus-geo-toolkit-bundle typecheck
pnpm --filter @onderwijsin/directus-geo-toolkit-bundle test:bundle
```

Load the built package into a trusted Directus server using the workspace extension mount, then
reload or restart Directus. The target is Directus `>=12.2.0 <13` and Node `>=24.10.0`. The bundle
contains ordinary non-sandboxed operation entries and cannot be installed in sandbox-only hosts. Map
rendering requires WebGL; address search and selection remain usable if the map is hidden or
unavailable. No collections, fields, hooks, Flows, accounts or credentials are created.

## Set up Mapbox Address

1. Create or choose a nullable JSON field and select **Mapbox Address**
   (`geo-mapbox-address-interface`).
2. Configure a browser-public Mapbox token in Directus project settings
   (`directus_settings.mapbox_key`) or in the interface's **Public Mapbox key** option.
3. Allow the required Mapbox connections/workers in the Studio's Content Security Policy.
4. Type an address, choose a result with the pointer or Arrow keys followed by Enter, then save the
   item through Directus. Enter alone does not silently select the first result.

The editor uses Directus `VInput`, `VMenu`, `VList`, `VListItem`, `VButton` and `VNotice`. When the
map is shown, search sits at its top-left; without a map, the same input works on its own. Only one
map is used, and selecting a result updates its center, zoom and marker. Country and language remain
configurable; use `countries=["NL"]` and `language="nl"` for Dutch address entry.

Typing only changes the search query; choosing a result emits the normalized JSON field value.
**Clear** explicitly emits null when `allowClear` is enabled. Disabled fields cannot search or
clear; noneditable fields retain their styling and hide mutation controls. Mounting, focusing,
reopening or receiving an external field update does not geocode or emit an edit. The selected map
marker cannot be dragged. The map retains its built-in attribution; the verbose geocoding response
notice is not rendered below it.

## Credentials

A nonempty interface `mapboxKey` overrides the native Studio settings key. Empty overrides fall back
to `directus_settings.mapbox_key`. Settings hydration and key changes are reactive. Only `pk.`
browser-public tokens are accepted; secret-scope `sk.` tokens are rejected. Public tokens are
visible in browser requests by design. Restrict tokens to the intended Studio origins, keep scopes
minimal, and never put secret credentials in these fields.

There is no credential/geocoding endpoint or server environment configuration. Search uses ofetch
against Geocoding API v6 from the browser. Offline Flow operations are not involved in search.

### Required Mapbox token permissions

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

## Configuration

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

Existing fields keep their saved result-type restrictions. Enable **Address**, **Street**, and
**Place** in **Result feature types** for the new default address-and-town search. Address-only
search deliberately excludes town names such as Soest; Mapbox can return HTTP 200 with no features
for that filter. A full street address remains searchable with Address enabled.

The configured map height is reserved while the renderer loads. Search stays inside its own field,
including when the map is loading or unavailable.

## Storage and normalized values

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

The component-paths JSON editor includes city, postcode and country examples. The shared schema
contains provider-neutral address fields; Mapbox provenance is defined in the interface adapter.
`featureType` is a literal union of the supported geographic types. The saved Mapbox JSON shape is
unchanged.

City defaults to Mapbox's `place` name. Municipality defaults to null; configure a source path only
when the provider's hierarchy meets your needs. A place/district name is not proof of an
authoritative municipality. Unsupported saved versions and malformed values show feedback without
silently repairing the record. The user's next explicit selection or clear can replace an invalid
saved value.

## CSP and requests

For the bundled Mapbox GL JS renderer, retain the Studio's existing CSP entries and add only the
needed directives: `connect-src https://api.mapbox.com https://events.mapbox.com`,
`worker-src blob:`, and `img-src data: blob:`. The v6 search requests use
`https://api.mapbox.com/search/geocode/v6/`. Mapbox styles, fonts, tiles and session requests use
the same API origin. Narrow paths further if required by your deployment; do not disable CSP
globally. Standard/3D styles may need additional WebAssembly permissions. The default Light/Dark
styles do not opt into those features. See
[Mapbox CSP guidance](https://docs.mapbox.com/mapbox-gl-js/guides/security-and-testing/).

The SDK emits one app bundle containing Mapbox GL JS and CSS; map construction is deferred until
`showMap` and valid credentials permit it. Map state uses a per-map token, not a shared global
token. Unmounting or changing display credentials disposes the map/marker and resize observer.

Requests are debounced. Superseded results are ignored when queries, settings, or editing state
change, or the component unmounts. Requests use ofetch defaults. Errors shown to users never include
raw upstream error bodies, tokens or address queries. No result cache is used. The upstream query
limit is 256 characters/20 words; semicolons are rejected before sending.

## Extract Geolocation Data

Use `geo-extract-geolocation-operation` in an Event Hook **Filter (Blocking)** Flow for item
create/update. Set the Flow Response Body to **Data of Last Operation** (or this operation's key).
The operation returns the complete item with derived fields added; it preserves unrelated fields and
never reads or writes records itself. See
[Directus filter triggers](https://directus.com/docs/guides/flows/triggers).

| Option                | Default                  | Behavior                                                                                                                                      |
| --------------------- | ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `payload`             | `{{ $trigger.payload }}` | Resolved item object or array; bind a previous operation's result when chaining.                                                              |
| `inputField`          | `address_data`           | Direct field containing the saved address.                                                                                                    |
| `outputs`             | mappings below           | In a supplied object, omitted keys and falsy values (null, false, 0, empty string) disable outputs. Leaving outputs unset uses all defaults.  |
| `overwrite`           | `replace`                | `replace` overwrites; `preserve-input` only adds absent fields; `fill-empty` fills null, undefined or empty strings.                          |
| `missingInput`        | `skip`                   | Entire source field absent/undefined: skip leaves the item unchanged; error rejects.                                                          |
| `nullInput`           | `clear`                  | Entire source field null: clear enabled destinations subject to overwrite policy; skip leaves the item unchanged; error rejects.              |
| `missingComponent`    | `null`                   | A valid address lacks an enabled component: null writes null, skip leaves its destination unchanged, error rejects; applied before overwrite. |
| `countryCodeCase`     | `upper`                  | `upper`, `lower` or `preserve`.                                                                                                               |
| `coordinatePrecision` | `8`                      | Decimal places for coordinates and Point, integer 0–15.                                                                                       |

Default mappings: `formattedAddress → formatted_address`, `address → address`, `street → street`,
`houseNumber → house_number`, `city → city`, `postcode → postal_code`,
`municipality → municipality`, `district → district`, `region → region`, `country → country`,
`countryCode → country_code`, `longitude → longitude`, `latitude → latitude`,
`point → location_geopoint`. Destinations must be unique direct keys, distinct from the source;
nested paths and prototype keys are rejected. The operation does not look up the collection schema.
It adds configured destinations to the returned payload; Directus 12.2 ignores nonexistent
collection fields when persisting them. It never creates fields. Existing fields remain subject to
Directus type validation and permissions. Configure fields that exist in your collection.

Supported sources are the version-one Geo Toolkit Mapbox value and the GeoJSON Point Feature saved
by
[Directus Labs Address Completion](https://github.com/directus-labs/extensions/tree/main/packages/address-completion-interface).
Google values use `properties.formated` (the upstream spelling), `raw` components with
`longText`/`shortText`/`types`, and the saved country/postalCode/administrativeArea properties.
`route` and `street_number` supply the street address; `locality` supplies city;
`administrative_area_level_2` supplies district and level 1 supplies region. Municipality stays
null: no authoritative municipality is inferred. Country names use the raw country component; codes
use the saved country code. Missing values follow `missingComponent`.

To populate a native Directus Map field, create a **Point** (`geometry.Point`) field with the
**Map** interface (`map`). The `point` output defaults to `location_geopoint`; set
`"outputs": { "point": "geopoint" }` if your field is named `geopoint`. It writes GeoJSON geometry
such as `{ "type": "Point", "coordinates": [4.5665234, 51.9332112] }`. Use a spatially supported
database such as PostgreSQL with PostGIS. See
[Directus Map interface](https://directus.com/docs/guides/data-model/interfaces#map).

Text remains text, including postal codes and house numbers. Point output is GeoJSON geometry with
longitude before latitude. Invalid present sources, unsupported versions, malformed payloads and
invalid options reject the operation. Every item in a supplied array is processed, without an
item-count limit or chunking. Batch errors identify the item index; input objects are never mutated
and no partial batch is returned. The operation needs no provider credentials or network calls.

Example options preserving every explicitly supplied destination, including null and empty strings:

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
`location_geopoint`. Existing database values absent from the incoming payload are not consulted.
Directus validates and persists the returned payload. The interface continues to update only its own
JSON field; create the Flow and destination fields explicitly.

## Registered operations and limitations

| ID                                  | Name                          | Status                                   |
| ----------------------------------- | ----------------------------- | ---------------------------------------- |
| `geo-extract-geolocation-operation` | Extract Geolocation Data      | Implemented payload transform.           |
| `geo-calculate-centroid-operation`  | Calculate Polygon Centroid    | Empty handler with no options or result. |
| `geo-polygon-grid-points-operation` | Calculate Polygon Grid Points | Empty handler with no options or result. |

Do not use the two polygon operations as filter Flow responses until implemented. The address
interface updates only its own JSON field; it does not populate separate address columns or geometry
fields. The planned operation contracts remain in SPEC.md. Search Box/POI search, marker dragging,
arbitrary map clicks and authoritative municipality enrichment are not provided.

## Troubleshooting

| Symptom                           | Check                                                                                         |
| --------------------------------- | --------------------------------------------------------------------------------------------- |
| Missing key/configuration message | Check Studio settings hydration and the field override.                                       |
| Request denied                    | Check the public token's allowed origins, scopes and permanent-geocoding account eligibility. |
| No addresses found                | Check query, countries, feature types and language.                                           |
| Map unavailable                   | Check WebGL, token/style, CSP and network; text selection remains available.                  |
| Saved address invalid             | Inspect the versioned JSON contract; explicitly reselect or clear.                            |
| Separate address fields unchanged | Check the filter Flow response, source field, output mappings and overwrite policy.           |

## Integration workflow

For Mapbox address entry, choose a nullable JSON field, resolve the requested credential source, and
configure search/map options from the table above. Use the native project key when a shared Studio
key is appropriate; use an explicit field override when it needs a separate origin-restricted token.
Do not create a credential endpoint or provision additional schema/Flow configuration automatically.

Preserve the complete version-one normalized value when reading or writing the field through an API.
Do not substitute a formatted string, GeoJSON Feature, raw Mapbox response or Google value. Let
Directus save the item after an explicit selection. Use Extract Geolocation Data to populate
separate fields through a blocking filter Flow. The two polygon operations remain unimplemented; do
not wire their empty handlers into filter Flows.

For deployment failures, distinguish missing/invalid credentials, provider/account denial, browser
CSP/WebGL failures and malformed saved values using the troubleshooting table. Keep private tokens
and queries out of diagnostic output. Use deterministic synthetic provider fixtures for tests;
changing permanent=false does not waive Mapbox storage restrictions.

Appearance follows the Directus user preference, project default, then browser preference for Auto.
The map reacts to Studio theme changes without clearing the selection or resetting the viewport.
Worldviews display country names while preserving Mapbox codes. The 24px X button is centered inside
the search input and only appears for a saved value (including an invalid saved value), clears it
and the search text, and respects Allow clearing and read-only settings. Search-only text does not
show the clear button. Loading uses an input spinner; empty results appear in the search dropdown.

The selected address is displayed in the search input. No duplicate address or coordinates are
rendered below the map; coordinates remain part of the saved JSON value.
