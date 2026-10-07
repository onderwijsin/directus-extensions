# @onderwijsin/directus-loops-bundle

## 0.3.2

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

## 0.3.1

### Patch Changes

- 616e7e3: Compose Loops environment options with the shared Directus startup configuration.

## 0.3.0

### Minor Changes

- 5a7b9bc: Seed a bundled Loops Studio Docs article, with an opt-out environment flag.

## 0.2.1

### Patch Changes

- 05d2f09: Expose the package main entry point through the Node.js exports map.

## 0.2.0

### Minor Changes

- e6ce29b: Add signed webhook verification and concurrency-safe campaign and recipient ingestion to
  the Directus Loops bundle.

### Patch Changes

- a26af04: Use Directus error classes for failures raised by API extension entries.
- 196746b: Preserve retryable database failures while handling Loops contact deletion webhooks.

## 0.1.0

- Add hook and Flow operation entrypoints with signed webhook verification and idempotent campaign
  ingestion.
