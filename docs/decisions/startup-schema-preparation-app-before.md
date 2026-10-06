# Decision: Run startup preparation during awaited init phases

- **Status:** Accepted
- **Date:** 2026-08-30
- **Scope:** `packages/extension-utils` startup coordination and extensions that use it

## Context

Several extensions provision Directus collections, fields, policies, or other schema-dependent
resources during startup. Some extensions also seed data into resources provisioned by another
extension. Registering both activities on `server.start` creates a race: Directus loads extensions
concurrently, and `server.start` action handlers do not provide a sequential cross-extension startup
order. A data seed can therefore run before the collection it needs exists.

The required invariants are:

> Every schema callback registered through the shared startup coordinator must finish before any
> data callback registered through that coordinator can begin, and every coordinator-managed data
> callback must finish before Directus starts serving requests.

The relevant Directus lifecycle and unregister-collection behavior was verified in the source for
Directus v12.2.0 (the existing E2E baseline) and v12.4.1:

- Extension registration is concurrent across sources and extensions; there is no supported global
  extension priority or dependency ordering mechanism.
- `server.start` is emitted as an action after the server begins listening. Action listeners are
  dispatched concurrently and the action emitter is not awaited sequentially.
- `app.before` is an init event awaited during application creation, before Directus can start the
  HTTP server or emit `server.start`.
- `middlewares.before` is the next awaited init phase after `app.before`. It is the earliest
  coordinator phase after schema preparation and before middleware and route registration continue.
- `registerHook()` invokes hook setup synchronously and returns the collected unregister callbacks.
  Bundle registration immediately copies those callbacks into its own cleanup array. Lifecycle
  listeners must therefore register during synchronous hook setup to be included in that cleanup.

Primary source references:

- Directus v12.2.0:
  [extension manager](https://github.com/directus/directus/blob/v12.2.0/api/src/extensions/manager.ts),
  [emitter](https://github.com/directus/directus/blob/v12.2.0/api/src/emitter.ts),
  [app lifecycle](https://github.com/directus/directus/blob/v12.2.0/api/src/app.ts), and
  [server lifecycle](https://github.com/directus/directus/blob/v12.2.0/api/src/server.ts).
- Directus v12.4.1:
  [extension manager](https://github.com/directus/directus/blob/v12.4.1/api/src/extensions/manager.ts),
  [emitter](https://github.com/directus/directus/blob/v12.4.1/api/src/emitter.ts),
  [app lifecycle](https://github.com/directus/directus/blob/v12.4.1/api/src/app.ts), and
  [server lifecycle](https://github.com/directus/directus/blob/v12.4.1/api/src/server.ts).

## Decision

The shared `createDirectusStartupCoordinator` registers lifecycle handlers synchronously as callback
groups first become used. Creating a coordinator registers no handlers, unused groups receive no
handler, and additional callbacks reuse the existing handlers:

- All `startup.schema()` callbacks run from one `hook.init('app.before', ...)` handler.
- The first `startup.data()` or `startup.documentation()` callback registers one
  `hook.init('middlewares.before', ...)` handler. At execution, this first slot runs data when used,
  otherwise documentation.
- When both middleware groups become used, a separate second `middlewares.before` handler runs
  documentation. Data therefore retains the first listener regardless of consumer call order.
  Documentation callbacks remain a distinct coordinator group without introducing a new lifecycle
  phase or sharing a handler with data when both are used.
- The coordinator accepts the complete `RegisterFunctions` object rather than only an action
  registrar, so it can register the phase lifecycle handlers.
- Schema callbacks run under the existing coordinator lock and are awaited in registration order
  within that coordinator.
- Data callbacks retain their existing lock, gate, renewal, error handling, and registration-order
  behavior while becoming part of the awaited application startup path.

The first middleware listener is a stable primary slot whose callback group is selected at
execution, not captured when the listener is registered. If `startup.documentation()` is called
first, that listener initially has only documentation work available. A later synchronous
`startup.data()` call must leave the primary listener in place but make it execute data, and
register a separate second listener for documentation. The same two roles result when data is
registered first. Capturing the first caller's group would instead make listener semantics depend on
consumer call order and reverse the previous data-before-documentation behavior for
documentation-first consumers.

This dynamic selection allows each first callback to register its listener immediately, without
registering a listener for an unused group or deferring registration until all groups are known.
Synchronous registration also ensures Directus's immediate bundle cleanup snapshot includes every
unregister callback. Data and documentation keep separate listeners when both are used; the primary
slot preserves listener registration semantics, not a sequential execution guarantee between groups.

This decision applies to schema and data work registered through the shared coordinator. It does not
create an ordering guarantee between independent init listeners, nor does it make one extension load
before another. Extensions must continue to use the coordinator for schema-dependent startup work.

Callbacks must be registered synchronously during extension setup. Consumers may call the phase
methods in any order. The existing Magic Links, Coolify Deployments, Markdown Editor, Studio Docs,
Loops, Sluggernaut, and E2E playground consumers already do this, either directly in their hook
entrypoint or through a synchronously invoked registration helper. Lazy registration requires no
consumer source changes and leaves the public `schema()`, `data()`, and `documentation()` API
unchanged.

## Alternatives considered

- **Keep data work on `server.start`:** Rejected because action handlers can overlap, Directus does
  not await the action emission, and `server.start` occurs after the HTTP server is listening.
- **Run data work on `app.after`:** Rejected because route registration and other application setup
  have already completed by that point. `middlewares.before` is an earlier awaited phase after
  schema preparation.
- **Rely on extension folder names, package order, or registration order:** Rejected because
  Directus does not expose a supported global extension priority mechanism and registration is
  concurrent.
- **Add bounded retries to data seeds:** Rejected as the primary correctness mechanism. Retries hide
  the lifecycle race, add startup latency, and still do not establish that schema work has
  completed.
- **Use an external entrypoint or migration before Directus starts:** Not selected for this
  coordinator. An external preparation phase could provide fail-fast startup semantics, but it would
  add deployment-specific orchestration beyond the extension contract.
- **Keep documentation callbacks in the ordinary data callback group:** Rejected because
  documentation seeding must remain available when ordinary schema or data startup is disabled.
  `startup.documentation()` is therefore a separate coordinator registration group, while still
  using the existing awaited `middlewares.before` lifecycle phase rather than adding a new Directus
  lifecycle phase.
- **Defer lifecycle listener registration:** Rejected because Directus copies bundle unregister
  callbacks synchronously after hook setup. Later listener registrations miss that cleanup snapshot.

## Consequences

Positive consequences:

- Schema preparation is complete before any `middlewares.before` data callback can begin.
- Coordinator-managed data seeding is complete before Directus proceeds to serve requests.
- Extensions no longer need to coordinate schema readiness through load order or timing assumptions.
- Existing schema and data callbacks keep their lock ownership, feature gates, and error reporting.
- Documentation callbacks remain independently available while ordinary startup gates are disabled.
- Unused callback groups add no lifecycle listeners and perform no startup coordination.
- Data before documentation remains internal to the coordinator; consumers do not need to register
  data callbacks before documentation callbacks.
- Listener unregister callbacks are available when Directus collects them for extension cleanup.
- The lifecycle contract is explicit in the coordinator API and its documentation.

Costs and limitations:

- The coordinator API changes from accepting an action registrar to accepting `RegisterFunctions`;
  all existing consumers must pass the complete hook object.
- Multiple listeners within an init phase remain concurrent with one another. This decision does not
  establish ordering between independent `app.before` or `middlewares.before` listeners.
- The data and documentation listener slots preserve their prior registration semantics, but do not
  guarantee sequential execution between those listeners or other `middlewares.before` listeners.
  The callback groups remain separate for gating and ownership.
- Directus logs init-handler failures and continues application startup. This decision provides an
  ordering and completion barrier, not a general fail-fast guarantee. Deployments that require
  preparation to succeed before Directus starts should perform that preparation outside the
  extension lifecycle.
- Schema and data callbacks now execute before the HTTP server listens, so slow provisioning or
  seeding extends application startup time. The existing distributed lock, lease renewal, and
  callback logging remain required for safe operation across replicas.

## Reconsideration criteria

Revisit this decision if Directus introduces a documented extension dependency/priority mechanism,
changes the lifecycle semantics of `app.before`, `middlewares.before`, or `server.start`, or the
project adopts an explicit external migration/bootstrap phase that supersedes extension-owned schema
provisioning.
