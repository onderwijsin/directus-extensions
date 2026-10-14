# Decision: Use browser Mapbox credentials for Geo Toolkit address entry

- **Status:** Accepted
- **Date:** 2026-10-13
- **Scope:** Geo Toolkit interface provider requests, credentials and browser runtime

## Context

Geo Toolkit needs address lookup and map presentation within the Studio. The accepted specification
requires native `directus_settings.mapbox_key` support, per-interface public token overrides,
ofetch, and configurable permanent geocoding. The user approved the required interface dependencies.

## Decision

Call Geocoding v6 directly from the browser using ofetch. Resolve a nonempty interface key before
the hydrated Studio settings key. Accept only browser-public tokens; do not expose secret tokens or
introduce a credential/geocoding endpoint. Use Mapbox GL JS 3.32.0 for map rendering with per-map
credentials and disposable lifecycle state.

Keep provider response, option and stored-value validation at Zod boundaries. Store normalized
versioned addresses and truthful permanent/temporary provenance, not tokens or raw responses.
Temporary mode does not waive Mapbox's storage restrictions. Operators configure CSP and token
origin restrictions; the extension does not alter server security settings automatically.

The operations remain separate offline payload transformations and are not implemented by this
interface change. No geometry processing dependency is needed for address lookup or point rendering.

## Alternatives considered

- A server proxy: unnecessary for the requested Studio-readable public credentials; revisit if
  secret credentials or centrally enforced request budgets are required.
- Search Box widgets: their API allows temporary result use by default, so the proposed
  `MapboxSearchBox` cannot replace permanent Geocoding v6 without a separate storage agreement. See
  [Search Box restrictions](https://docs.mapbox.com/api/search/search-box/#search-box-api-restrictions-and-limits).
- Nuxt-specific integration: unnecessary inside the Directus Studio. The existing map is reused and
  disposed by its composable; the search input uses Directus UI controls. The
  [Directus Labs Google implementation](https://github.com/directus-labs/extensions/blob/main/packages/address-completion-interface/src/interface.vue)
  informs the menu/list UI and top-left search placement, without adding Google's sessions or
  storing its raw provider objects.
- A custom map renderer: unnecessary maintenance compared with the provider's typed renderer.

## Consequences

Studio CSP must permit the documented Mapbox requests, workers and image sources. Public credentials
are observable in the browser. Request errors are sanitized, stale responses are ignored, and result
selection is explicit. Map failure leaves textual selection available.

The Directus SDK emits one app bundle including Mapbox GL JS, approximately 2 MB before transfer
compression. Component/map construction is deferred, but this does not claim a separate renderer
network chunk. Component, provider and lifecycle tests use synthetic fixtures and renderer doubles.
A dedicated built-app test verifies async component loading and the complete geocoding/selection
path. The loader explicitly returns the component, since the SDK's inlined module namespace lacks
the marker Vue uses to unwrap a dynamic import automatically.

## Reconsideration criteria

Revisit for server-held secret credentials, centralized quotas, different provider retention rights,
or a supported SDK strategy that materially reduces renderer transfer cost.
