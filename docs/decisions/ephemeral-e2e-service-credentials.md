# Decision: Use ephemeral credentials for E2E

- **Status:** Accepted
- **Date:** 2026-08-15
- **Scope:** `scripts/e2e.mjs` and `tests/compose.e2e.yaml`

## Context

The E2E stack runs databases, caches, Directus, object storage, and search services. Fixed passwords
and service secrets make accidental reuse easy and can leak into logs, local state, or future test
environments.

## Decision

At the start of each E2E run, the runner generates fresh credentials for Directus, PostgreSQL,
Valkey, Garage, and Meilisearch. It passes them to every Compose invocation through the process
environment and removes the run-scoped containers, network, and named volumes in cleanup. The E2E
path must not require the developer’s `.env` file.

## Alternatives considered

- Fixed checked-in development secrets: simple, but reusable and unsafe as the E2E contract expands.
- Reusing `.env`: couples tests to developer state and makes CI setup less deterministic.
- External secret storage: unnecessary for credentials that should exist only for one isolated run.

## Consequences

E2E runs are deterministic with respect to configuration, isolated from local credentials, and safer
in CI. Diagnostics must avoid printing generated secret values, and cleanup remains mandatory so
run-scoped volumes do not accumulate.

## Reconsideration criteria

Revisit this decision if the E2E environment gains a service that cannot accept runtime credentials,
or if a managed test environment replaces the local Compose stack and provides equivalent isolation.
