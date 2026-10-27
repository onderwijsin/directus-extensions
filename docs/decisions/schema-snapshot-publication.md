# Decision: Protect split snapshot publication and application across processes

- **Status:** Accepted
- **Date:** 2026-10-15
- **Scope:** Schema snapshot bundle filesystem publication and CLI/server concurrency

## Context

The automatic hook runs in the Directus server, while a CLI apply can run in a separate Node
process. The apply flag suppresses new automatic triggers but cannot exclude a snapshot already
running. Clearing output and writing metadata first let apply interpret missing definitions as
removals. Snapshot directories can be mounted independently, making replacement of the directory
itself unsuitable as the publication protocol.

## Decision

Use one exclusive directory claim at `tmpdir()/directus-schema-snapshot/operation.lock` for
automatic and manual snapshot creation, migration, and the complete apply operation. Acquire it
before service initialization or reading snapshot files; release it after all writes, convergence
checks, and apply flag cleanup. Reject contention immediately. Only the owner performs cleanup.

Do not expire or automatically reclaim this lock. An expired lease cannot fence a paused filesystem
writer or a Directus service call already in progress. Prefer explicit recovery after confirming all
operations have stopped over allowing overlapping owners. Retain the existing automatic scheduling
lease and apply flag for their scheduling and suppression roles.

Serialize YAML before touching output. Remove metadata before changing definitions; write metadata
to a temporary file and rename it into place only after every definition is written. Preserve the
existing directory, CLI, environment, YAML format, and migration's non-clearing behavior. An I/O
failure or cancellation leaves metadata absent, so apply fails closed after the operation unlocks.

## Alternatives considered

- In-memory mutex: cannot exclude a standalone CLI from the server process.
- Apply flag alone: has a check-then-act race and no writer or apply ownership.
- Metadata-last publication alone: cannot prevent a reader that began before invalidation from
  consuming mixed generations; shared exclusion is also required.
- Staged directory swap: unsuitable for a snapshot root that is itself a bind mount. Keeping the
  previous snapshot available throughout a failed write would need a larger storage contract.
- Expiring shared utility leases: permit takeover while an old process can still mutate files or
  apply schema; no fencing mechanism exists here.
- Distributed locks: introduce infrastructure beyond the existing shared-temporary-storage contract.

## Consequences

Processes sharing temporary storage exclude snapshot/snapshot, snapshot/apply, migration/apply, and
apply/apply races, even when using different snapshot folders. Interruption can require manual lock
cleanup and snapshot regeneration. This does not roll back an interrupted database apply or preserve
the previous output as a backup. Atomic metadata rename is a publication boundary, not a guarantee
of durability across filesystem or power failure.

Separate temporary directories, old bundle versions, external snapshot edits, and schema mutations
outside this bundle remain uncoordinated. Sharing only snapshot output is insufficient. Operators
must share temporary storage or serialize these operations with other writers stopped.

## Reconsideration criteria

Revisit when deployments require independent container temporary directories, automatic crash
recovery with fencing, or retention of the previous snapshot throughout failed writes.
