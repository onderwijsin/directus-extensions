# Decision: Use async-local mutation source context for nested Sluggernaut writes

- **Status:** Accepted
- **Date:** 2026-08-23
- **Scope:** Sluggernaut Directus hook mutation orchestration

## Context

Sluggernaut's automatic redirect-history workflow performs nested `ItemsService` writes to the
configured redirect collection. Directus delivers those nested writes through the same mutation
hooks as external user mutations, so the redirect hook needs to distinguish the two sources.

External structural edits to a managed redirect transfer ownership. Sluggernaut's own history writes
must preserve provenance and must not be mistaken for external edits.

## Decision

Use Node.js `AsyncLocalStorage` to carry `MutationSource` (`internal` or `external`) through the
asynchronous call tree of one mutation. The default is `external`; Sluggernaut wraps its own nested
redirect-history writes with `withMutationSource('internal', ...)`.

This context is deliberately process-local and request-local. It is not used for distributed locks,
coordination, or durable state. Each replica establishes the context independently around the
internal writes it initiates.

## Alternatives considered

- **Global mutable flag:** rejected because concurrent requests in one Directus process could
  observe the wrong mutation source.
- **Accountability or system user identity:** rejected because nested service calls may share or
  omit accountability, and identity does not reliably express the reason for a write.
- **Directus event metadata:** preferred if Directus provides a stable internal-mutation marker, but
  no such repository-supported marker is currently available.
- **Transaction or database metadata:** rejected as the primary mechanism because hook callbacks
  need the source before persistence and database metadata does not reliably flow through Directus
  events.
- **Distributed shared state:** rejected because the source is only relevant to a nested call tree;
  replicas do not need to communicate this short-lived fact.

## Consequences

The marker is safe for concurrent requests within one process and scales across replicas because it
does not maintain shared mutable state. It relies on the supported Node.js runtime and must remain
scoped to the async call tree; code that starts detached work outside that tree must not depend on
the marker.

The source marker bypasses ownership transfer for internal history writes only. Local redirect
validation remains applicable, while the established history planner remains authoritative for the
structural coordination of its own concurrent writes.

## Reconsideration criteria

Revisit this decision if Directus exposes a stable internal-mutation event marker, if Sluggernaut
supports a runtime without `AsyncLocalStorage`, or if mutation-source state must cross process or
request boundaries.
