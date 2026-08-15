# Decision: Use Node 24 for organization runtimes

- **Status:** Accepted
- **Date:** 2026-08-15
- **Scope:** Organization-owned Directus instances and extensions in this repository

## Context

The organization's self-hosted Directus instances run on Node 24. Extensions in this repository are
built and operated for those instances rather than for arbitrary external Directus consumers.

## Decision

Published packages in this repository target Node 24 and may declare `engines.node` as `>=24.10.0`.
External consumers running an older Node version are outside the supported audience.

## Consequences

CI, local development, package metadata, and extension documentation should remain aligned with
Node 24. Compatibility with Node 22 or older is not a release requirement unless this decision is
revisited.
