# `extension-utils` glossary

This glossary explains the vocabulary used by the Directus extension utilities. The examples use
locks and auto-tasks because those APIs coordinate work over time and across Directus processes.

## The short version

- A **lock** answers: “Which owner may do this work right now?”
- A **lease** is the time-limited permission granted to that owner.
- A **token** identifies the specific owner and lease generation.
- **Renewal** extends that permission while the work is still running.
- **Release** gives the permission back when the work finishes.
- A **task handler** turns repeated triggers into one coordinated task run.
- A **marker** records that a trigger happened and which trigger is newest.
- A **storage** combines the marker store and lock provider used by a task handler.

The central lifecycle is:

```text
trigger → marker generation → debounce → acquire lease → run task → renew while running → release → clear marker
```

## Runtime and storage terms

### Directus runtime

The Directus process in which an extension is loaded and runs. These utilities are intended for
Directus extensions. “Runtime-agnostic” means that the same utility concepts work across different
Directus setups; it does not mean that this package is intended for unrelated Node.js applications.

### Provider

A provider implements one coordination mechanism. For locks, the providers are memory, Redis, and
filesystem. The provider determines who can see the coordination state.

### Local or process-local

State visible only inside one Node.js process. Memory locks share state between providers with the
same `providerId`, while memory task storage remains local to its store instance. Neither
coordinates separate Directus replicas.

### Distributed or shared

State visible to multiple Directus processes because they share Redis or a filesystem directory.
Redis is appropriate for separate replicas. Filesystem coordination requires the directory to be
actually shared by those replicas.

### Namespace

A prefix used to keep one extension's keys separate from another extension's keys in a shared
backend. Cache namespaces are supported by Redis-backed `initializeCache` instances and scope
`clear()`; local cache instances remain private regardless of namespace. Namespaces are not locks
and do not grant ownership.

### Storage

The `TaskHandlerStorage` object supplied to `createAutoTaskHandler`. It contains:

- a `lockProvider` for execution ownership;
- a `markerStore` for trigger generations; and
- `dispose()` for resources owned by the storage.

The storage factories keep the lock provider and marker store on the same backend so they observe
the same coordination state.

### Marker

A small record saying that a task was triggered. It contains an `updatedAt` timestamp and a
monotonically increasing `generation` number.

Markers are not locks. A marker says “work is pending”; a lock says “this owner is running the
work.”

### Generation

The increasing number assigned to each trigger for one task ID. If generation 3 is followed by
generation 4, generation 3 is obsolete and must not run or clear generation 4.

### Task ID

The stable identifier passed as `taskId`. It names both the marker stream and the execution lock.
Every trigger uses the same task ID and creates a new marker generation; the task ID is not
regenerated per trigger.

### Trigger

A call to the function returned by `createAutoTaskHandler`. A trigger records a marker and schedules
the latest generation. Calling the handler does not mean that the task has already run.

### Debounce

A waiting period after a trigger. New triggers during this period replace the scheduled generation,
so a burst of events results in one task run for the newest state.

### Eligibility

Whether a pending marker is still allowed to run. `markerLeaseMs` limits the age of pending work.
When the marker is too old, the handler discards that generation instead of running it.

## Lock terms

### Lock

A named coordination record representing exclusive ownership. A lock does not contain the task's
business data; it only prevents multiple owners from doing the same protected work simultaneously.

### Lock name

The logical name of a standalone protected operation, such as `products:reindex`. The same name must
be used by contenders that should exclude one another. Auto-task handlers use their task ID for this
purpose and do not expose a separate lock-name option.

### Owner

The process currently holding a lock lease. Ownership is specific to one lease generation, not just
to a lock name.

### Acquire

An attempt to become the owner of a lock. `tryAcquire()` returns an owner-bound lease when
successful, or `null` when another active owner holds the lock.

### Contention

The normal “someone else owns it” outcome. Contention is not necessarily an error. Auto-task
handlers keep the marker pending and retry after `retryMs` when execution acquisition is contended.

### Lease

A time-limited ownership grant. The owner must finish and release it before it expires, or renew it
while work continues. A lease prevents a crashed process from holding a lock forever.

### Lease duration

The number of milliseconds before a lease expires. `leaseMs` controls one `tryAcquire()` call.
Provider options such as `defaultLeaseMs` or `lockTimeoutMs` supply a default when an acquire call
does not specify a duration.

### Token

An opaque owner identifier attached to one lease generation. The token prevents an old owner from
releasing or renewing a replacement lease that uses the same lock name. Consumers should treat it as
an identifier, not parse or persist it.

### Renew

An owner-bound request to extend the current lease. `renew()` returns `true` when this owner still
controls the lock and the extension succeeds. It returns `false` when the lease expired, was
replaced, or was already released. A backend failure may reject instead.

### Release

An owner-bound request to give up the lock. `release()` returns `true` when this lease released the
lock and `false` when it no longer owns that generation. Always release in `finally` after a
successful acquisition.

### Expired lease

A lease whose duration has elapsed. Expiry allows another owner to acquire the same lock. The old
owner must not assume it can still release or renew the lock.

### Lost lease

The owner no longer has valid ownership, usually because renewal returned `false` or failed. An
auto-task handler aborts the task's `AbortSignal` and does not clear the marker after lease loss.

### Stale or orphaned lock

Coordination state left by a process that crashed or disappeared. Redis and filesystem providers use
lease expiry to recover it. Recovery must be owner-safe: stale cleanup must not remove a newer
owner's generation.

## Auto-task terms

### Auto-task handler

The function created by `createAutoTaskHandler`. It records triggers, waits for the debounce window,
checks marker age, acquires the execution lock, runs the task, renews the lease, and acknowledges
the matching marker when successful.

### Task lease

The execution lock lifetime configured by `taskLeaseMs`. It protects the task while it is running.
The handler renews this lease at `renewalIntervalMs` and aborts the task if ownership is lost.

### Marker lease

The maximum age configured by `markerLeaseMs` for a pending trigger generation. It protects against
running very old work. It is not the execution lock duration.

### Task

The callback passed as `task`. It receives an `AbortSignal` and should stop promptly when the signal
is aborted. The task may be synchronous or asynchronous, but normal work is asynchronous.

### Abort signal

The cancellation signal passed to the task. It becomes aborted when the handler loses the execution
lease. Aborting the signal does not magically stop arbitrary code; the task must observe it and
cooperate.

### Retry

For an auto-task, retry means rescheduling a still-pending generation after lock contention. It does
not create a new marker generation. `retryMs` controls the delay.

### Scheduler

The timer boundary used by the handler for debounce, retry, and lease-renewal timers. The default
scheduler uses Node timers. A custom `scheduler` is useful for deterministic tests or a specialized
Directus runtime.

### Handler disposal

`handler.dispose()` stops future triggers and cancels pending debounce/retry timers. It does not
abort a task that is already running and does not clear markers.

### Storage disposal

`storage.dispose()` releases resources owned by the storage. Redis task storage closes its Redis
connection; memory and filesystem task storage currently have nothing external to close. Dispose the
handler before disposing its storage.

## Cache and KV terms

### Cache

Disposable derived data. A cache miss is normal and the value can be recomputed. Use
`initializeCache` to select the configured local or Redis backend and `withCache` for explicit
cache-aside operations. Use stable extension-specific keys and invalidate them from relevant schema
or data events when cached values become stale.

### KV store

Key-value coordination state. The utility marker adapter uses Directus' `createKv` for generations,
marker records, increments, and atomic lock-protected updates. KV state is coordination state, not
merely an optional performance optimization.

## Common misconceptions

| Term            | It does not mean                                  |
| --------------- | ------------------------------------------------- |
| Marker          | A lock or proof that a task is running            |
| Lock name       | Ownership by itself                               |
| Token           | A user credential or reusable authorization token |
| Lease           | Permanent ownership                               |
| `renew()`       | A guarantee that the task will finish             |
| `release()`     | Clearing the task marker                          |
| `markerLeaseMs` | The task execution lock lifetime                  |
| `taskLeaseMs`   | The age limit for pending triggers                |
| `dispose()`     | Aborting already-running business work            |
