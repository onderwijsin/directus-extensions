# Decision: Enforce concurrent Sluggernaut redirect integrity in the database

- **Status:** Accepted
- **Date:** 2026-08-24
- **Scope:** Sluggernaut redirect collection, consumer migrations, and concurrent mutation behavior

## Context

Sluggernaut validates redirect mutations in Directus hooks. Those checks can detect duplicate active
exact origins and equivalent active patterns during ordinary mutations, but two concurrent processes
can both read the same pre-mutation state and then both persist a redirect. In-memory locks and
process-local coordination do not protect multiple Directus replicas, workers, imports, or direct
database writers.

The invariant is:

- active exact redirects are unique by `origin`;
- active pattern redirects are unique by `matcher_signature`;
- inactive history records are not constrained by these indexes.

## Decision

Consumers that require this invariant under concurrency must install the
[Sluggernaut redirect integrity migration template](../../migrations/20260824A-sluggernaut-redirect-integrity.js)
in their own Directus `migrations/` directory and run it through Directus's normal migration
pipeline after the redirect collection exists. Fresh installations must bootstrap Directus without
this collection-dependent migration, allow Sluggernaut (or a schema snapshot) to create the redirect
collection, and only then apply the migration. The template validates existing data before applying
schema changes.

The checked-in template supports PostgreSQL, MySQL, and SQLite:

- PostgreSQL and SQLite use partial unique indexes.
- MySQL uses nullable generated columns with unique indexes because it does not provide the same
  partial-index form.

Consumers using another database provider must translate the migration into equivalent provider-
specific SQL. Sluggernaut does not run the migration during extension startup.

Application-level validation remains responsible for normalization, redirect graph cycles, unmanaged
conflict policy, and pattern grammar. The database constraints are the final concurrency boundary
for uniqueness, not a replacement for those checks.

## Alternatives considered

- **Application-level validation only:** rejected because concurrent writers can pass the same
  preflight and create duplicate active redirects.
- **In-memory or process-local locks:** rejected because they do not coordinate multiple Directus
  processes or replicas.
- **Distributed locks through Redis or Directus memory:** rejected because they add operational
  infrastructure and still do not protect direct database writes; the database already owns the
  invariant.
- **Run the migration from extension startup:** rejected because startup orchestration would add
  ordering, permissions, failure, and rollback complexity to extension loading.
- **One vendor-neutral Knex schema operation:** rejected because partial indexes and conditional
  uniqueness have materially different support across database vendors.

## Consequences

The constraint prevents duplicate active redirect matches even when application-level preflight is
defeated by concurrency. A losing concurrent transaction may receive a database conflict and must be
retried by its caller; the extension must not attempt to continue a failed database transaction from
inside a hook.

Existing duplicate data must be repaired before the migration can be applied. The migration fails
closed rather than selecting or deleting a winner automatically. The MySQL implementation adds two
generated helper columns to the physical table, which consumers must preserve.

The migration is consumer-owned because the redirect collection name is configurable and because
Directus custom migrations are project deployment artifacts rather than bundle entries.

## Reconsideration criteria

Revisit this decision if Directus provides a documented transaction boundary that can atomically own
the source mutation and redirect planning across concurrent requests, or if Directus adds a
vendor-neutral schema API for conditional unique constraints. Revisit the vendor templates when the
repository's supported database matrix changes.
