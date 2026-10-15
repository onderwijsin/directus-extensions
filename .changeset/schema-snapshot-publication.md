---
'@onderwijsin/directus-schema-snapshot-bundle': patch
---

Prevent concurrent snapshot writes and schema application from consuming incomplete definitions.
Use an exclusive filesystem operation lock across processes sharing temporary storage, hold it
through the full apply loop, and publish metadata only after all definitions are written. Failed
writes remain unappliable. Document contention, interrupted-operation recovery, coordination limits,
and hardened-image CLI invocation.
