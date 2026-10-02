---
name: directus-iconify-bundle
description: Install and use the Iconify picker, icon display, and API proxy in Directus.
---

# Directus Iconify bundle

Use `@onderwijsin/directus-iconify-bundle` to store Iconify icon identifiers in string fields and
render them in Directus Studio.

## Install

Use Directus `>=12.2.0 <13` on Node.js `>=24.10.0`. The Directus server needs outbound HTTPS access
to `api.iconify.design` when using the default proxy. Install the package into a trusted Directus
runtime and restart:

```sh
pnpm add @onderwijsin/directus-iconify-bundle
```

The API endpoint is non-sandboxed and unavailable on hosts that permit only sandboxed extensions.
The package includes `vue-virtual-scroller` and `@iconify/vue` as runtime dependencies. If a source
checkout is mounted into Directus, run `pnpm --filter @onderwijsin/directus-iconify-bundle build`
before starting the server so `dist/api.js` and `dist/app.js` exist. No environment variable,
secret, migration, or extra Directus collection is required.

## Configure a field

Create a string field and select the **Iconify Icon** interface. **Icon collections** accepts
multiple collection prefixes. Leave it empty to include every collection. Restricting the list is
recommended because loading every collection can take time and creates many requests. The picker
stores a single `collection:name` value, for example `mdi:home`, or `null` when cleared. It has a
searchable input, grouped icon rows, a clear action, and virtual scrolling.

The collection option is a searchable static list; it does not call the Iconify API while
configuring the field.

Select the **Iconify Icon** display for list or detail views. It renders only the icon for a valid
stored value. Empty or malformed values render nothing. Missing icons produce an unavailable image.
Both the interface and display offer **Use Iconify proxy**, enabled by default. Disable it
separately on either extension to fetch Iconify data directly in the browser. This requires browser
access to `https://api.iconify.design` and a Studio Content Security Policy that permits it.

## API

The same-origin public GET routes are `/iconify/collections` for collection metadata,
`/iconify/collection/:prefix` for a collection's icon names,
`/iconify/search?query=...&prefixes=...&start=...` for Iconify search,
`/iconify/:prefix.json?icons=...` for the Vue component's icon data, and
`/iconify/icon/:prefix/:name` for SVG images. The proxy forwards only these requests to the fixed
Iconify host. Collection and icon names must contain lowercase letters, digits, and hyphens. Search
queries require 2–100 characters. Invalid requests return 400. Upstream failures or unavailable
icons are reflected in the response.

The extension does not add field permissions, cache infrastructure, or a self-hosted Iconify
service. Review individual icon-set licenses before using their icons. If icons do not appear, check
Directus outbound access to Iconify and the saved `collection:name` value.
