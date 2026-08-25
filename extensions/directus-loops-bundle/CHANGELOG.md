# @onderwijsin/directus-loops-bundle

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
