# Decision: Run startup schema preparation during `app.before`

- **Status:** Accepted
- **Date:** 2026-08-30
- **Scope:** `packages/extension-utils` startup coordination and extensions that use it

## Context

Several extensions provision Directus collections, fields, policies, or other schema-dependent
resources during startup. Some extensions also seed data into resources provisioned by another
extension. Registering both activities on `server.start` creates a race: Directus loads extensions
concurrently, and `server.start` action handlers do not provide a sequential cross-extension startup
order. A data seed can therefore run before the collection it needs exists.

The required invariant is:

> Every schema callback registered through the shared startup coordinator must finish before any
> data callback registered through that coordinator can begin.

The relevant Directus lifecycle behavior was verified against Directus v12.2.0:

- Extension registration is concurrent across sources and extensions; there is no supported global
  extension priority or dependency ordering mechanism.
- `server.start` is emitted as an action after the server begins listening. Action listeners are
  dispatched concurrently and the action emitter is not awaited sequentially.
- `app.before` is an init event awaited during application creation, before Directus can start the
  HTTP server or emit `server.start`.

Primary source references:
[Directus extension manager](https://github.com/directus/directus/blob/v12.2.0/api/src/extensions/manager.ts),
[Directus emitter](https://github.com/directus/directus/blob/v12.2.0/api/src/emitter.ts),
[Directus app lifecycle](https://github.com/directus/directus/blob/v12.2.0/api/src/app.ts), and
[Directus server lifecycle](https://github.com/directus/directus/blob/v12.2.0/api/src/server.ts).

## Decision

The shared `createDirectusStartupCoordinator` registers lifecycle handlers immediately when it is
created:

- All `startup.schema()` callbacks run from one `hook.init('app.before', ...)` handler.
- All `startup.data()` callbacks run from one `hook.action('server.start', ...)` handler.
- The coordinator accepts the complete `RegisterFunctions` object rather than only an action
  registrar, so it can register both lifecycle handlers.
- Schema callbacks run under the existing coordinator lock and are awaited in registration order
  within that coordinator.
- Data callbacks retain their existing lock, gate, renewal, error handling, and registration-order
  behavior.

This decision applies to schema work registered through the shared coordinator. It does not create
an ordering guarantee between independent `app.before` listeners, nor does it make one extension
load before another. Extensions must continue to use the coordinator for schema-dependent startup
work.

## Alternatives considered

- **Keep schema and data work on `server.start`:** Rejected because action handlers can overlap and
  `server.start` occurs too late to serve as a startup barrier.
- **Rely on extension folder names, package order, or registration order:** Rejected because
  Directus does not expose a supported global extension priority mechanism and registration is
  concurrent.
- **Add bounded retries to data seeds:** Rejected as the primary correctness mechanism. Retries hide
  the lifecycle race, add startup latency, and still do not establish that schema work has
  completed.
- **Use an external entrypoint or migration before Directus starts:** Not selected for this
  coordinator. An external preparation phase could provide fail-fast startup semantics, but it would
  add deployment-specific orchestration beyond the extension contract.
- **Add a new coordinator API such as `startup.docs()`:** Rejected because separate schema and data
  phases already express the dependency without introducing another public registration concept.

## Consequences

Positive consequences:

- Schema preparation is complete before any `server.start` data callback can begin.
- Extensions no longer need to coordinate schema readiness through load order or timing assumptions.
- Existing schema and data callbacks keep their lock ownership, feature gates, and error reporting.
- The lifecycle contract is explicit in the coordinator API and its documentation.

Costs and limitations:

- The coordinator API changes from accepting an action registrar to accepting `RegisterFunctions`;
  all existing consumers must pass the complete hook object.
- Multiple `app.before` listeners remain concurrent with one another. This decision only establishes
  the barrier from the completed `app.before` phase to `server.start`.
- Directus logs init-handler failures and continues application startup. This decision provides an
  ordering barrier, not a general fail-fast guarantee. Deployments that require schema preparation
  to succeed before Directus starts should perform that preparation outside the extension lifecycle.
- Schema callbacks now execute before the HTTP server listens, so slow schema operations extend
  application startup time. The existing distributed lock, lease renewal, and callback logging
  remain required for safe operation across replicas.

## Reconsideration criteria

Revisit this decision if Directus introduces a documented extension dependency/priority mechanism,
changes the lifecycle semantics of `app.before` or `server.start`, or the project adopts an explicit
external migration/bootstrap phase that supersedes extension-owned schema provisioning.
