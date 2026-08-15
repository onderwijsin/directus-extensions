# Decision: Use packed artifacts for Directus E2E

- **Status:** Accepted
- **Date:** 2026-08-15
- **Scope:** CI package validation and Directus integration testing

## Context

Testing extension source or workspace-linked packages does not prove that the package published to
npm contains the correct metadata, `dist/` output, dependencies, and Directus loading contract.
Those are separate consumer-facing surfaces.

## Decision

CI builds and validates public packages, packs them into temporary archives, uploads those exact
archives from the quality job, and installs them into a clean temporary E2E consumer before running
Directus tests. Directus E2E must use the packed artifact rather than a workspace symlink or raw
source directory.

## Alternatives considered

- Workspace-linked E2E: faster, but it can hide missing files, export errors, and package metadata
  problems.
- Source-mounted E2E: useful for local iteration, but it does not represent the release artifact.
- External consumer only: validates package installation and imports, but cannot prove Directus
  extension loading or registration.

## Consequences

Package and Directus loading failures are caught before release, at the cost of an additional build,
pack, install, and artifact-transfer phase. The local development loop may continue using mounted
workspace output; CI release evidence follows this decision.

## Reconsideration criteria

Revisit this decision only if the packaging model changes or a faster test can demonstrate
equivalent coverage of archive contents, package installation, and Directus loading.
