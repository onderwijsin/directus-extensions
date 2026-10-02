# @onderwijsin/directus-iconify-bundle

Directus bundle with an Iconify icon picker, an icon-only display, and a same-origin Iconify API
proxy.

## Requirements and installation

- Directus `>=12.2.0 <13` and Node.js `>=24.10.0`.
- A trusted Directus installation that permits non-sandboxed API extensions.
- Network access from Directus to `https://api.iconify.design` when using the proxy.

Install the package in the Directus runtime and restart Directus:

```sh
pnpm add @onderwijsin/directus-iconify-bundle
```

The bundle includes `vue-virtual-scroller` and `@iconify/vue` as runtime dependencies. In a source
checkout mounted into Directus, build the extension before starting Directus:

```sh
pnpm --filter @onderwijsin/directus-iconify-bundle build
```

## Usage

Create a string field, choose **Iconify Icon** as its interface, and optionally select one or more
**Icon collections** in its interface options. With no collections selected, the picker loads all
Iconify collections. The picker shows the same searchable input, grouped icon popover, clear action,
and virtual icon rows as Directus's native icon picker. Selecting an icon stores a string such as
`mdi:home`. Use the **Iconify Icon** display to render only the selected icon in lists and item
views.

Both the interface and display have a **Use Iconify proxy** checkbox, enabled by default. Turn it
off to request collection metadata and icon data directly from `https://api.iconify.design` in the
browser. Configure this option separately for the interface and display. Direct browser requests
require the Studio browser to reach Iconify and its Content Security Policy to permit that origin.

The field value should be a valid `collection:name` identifier. Invalid or empty values render no
image. An image that Iconify cannot provide remains unavailable.

## Proxy routes

All routes are GET requests under `/iconify`:

| Route                                      | Response                        |
| ------------------------------------------ | ------------------------------- |
| `/collections`                             | Iconify collection metadata     |
| `/collection/:prefix`                      | Names in one collection         |
| `/search?query=...&prefixes=...&start=...` | Iconify search response         |
| `/:prefix.json?icons=...`                  | Icon data for the Vue component |
| `/icon/:prefix/:name`                      | SVG image                       |

The upstream host is fixed to `api.iconify.design`, and collection and icon identifiers are
validated. The endpoint does not change Directus collection permissions. It has no environment
variables, collections, migrations, or credentials. The public Iconify service availability and icon
set licenses remain external dependencies. The picker and display use Iconify's Vue component to
render SVGs from icon data fetched through the selected route.
