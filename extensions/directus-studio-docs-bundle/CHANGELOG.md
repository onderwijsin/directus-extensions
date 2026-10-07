# Changelog

## 0.2.3

### Patch Changes

- c741f90: Register startup lifecycle listeners synchronously only for phases that are both used and
  enabled, preserving Directus's unregister collection during extension setup. Keep data in the
  first middleware listener and documentation in a separate second listener when both are used,
  regardless of consumer call order. Additional callbacks reuse existing listeners, and unused or
  disabled phases perform no startup coordination. Disabled schema/data callbacks are not stored;
  their existing disabled-phase messages are logged once per phase during registration.
  Documentation still bypasses the ordinary startup switches. The public API, lifecycle events,
  callback order, locking, and error handling remain unchanged. Execution-time gates remain
  defensive checks for registered callbacks.

  Rebuild the affected Directus extension bundles with the updated startup coordinator. The
  coordinator is bundled into their published artifacts, so releasing extension-utils alone would
  not update already-published bundles.

## 0.2.2

### Patch Changes

- 7736b1d: Compose Studio Docs environment options with the shared Directus startup configuration.

## 0.2.1

### Patch Changes

- a689a36: Respect the global schema-change disable switch during Studio Docs provisioning.
- ea76771: Prevent the seeded Studio Docs policies from granting Directus Data Studio access.

## 0.2.0

### Minor Changes

- 5a7b9bc: Implement the Studio Docs navigation, article route, Markdown rendering, and audit
  metadata view.
- a8c5590: Add the initial Studio Docs bundle scaffold with a validated hook and stable Studio
  module routes.

### Patch Changes

- 6322d39: Prevent archived articles from rendering through direct Studio Docs routes and clarify
  the server-only scope of the docs enablement setting.

## 0.1.0

- Initial Phase 1 scaffold for the Studio Docs hook and Studio module.
