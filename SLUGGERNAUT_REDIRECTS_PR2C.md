# PR 2C handoff: integrity-safe `updateMany` preflight

Read [`SLUGGERNAUT_REDIRECTS.md`](./SLUGGERNAUT_REDIRECTS.md) first. It is the authoritative
redirect plan; this file is the implementation handoff for PR 2C only.

## PR 2 split

- **PR 2A — exact redirect domain primitives — complete.** Pure normalization, state
  materialization, ownership decisions, local validation, exact-integrity decisions, and relevant
  graph-frontier derivation live under `redirects/domain/`. They do not read Directus or call
  `ItemsService`.
- **PR 2B — direct exact mutation integration — complete.** Directus `items.create` and one-item
  `items.update` hooks live under `redirects/direct-mutations/`. They use the shared
  `redirects/service.ts`, resolve only the relevant active exact graph, apply external ownership
  transfer, preserve ownership for internal Sluggernaut writes, and enforce the configured
  `SLUGGERNAUT_MAX_REDIRECT_GRAPH_DEPTH` (default `25`).
- **PR 2C — this task.** Add integrity-safe `items.update` bulk preflight for `updateMany`. Keep
  `createMany` as sequential create behavior unless Directus' actual event contract requires an
  adapter change.

## Current layout

```text
extensions/directus-sluggernaut-bundle/src/sluggernaut-hook/redirects/
├── schema.ts
├── service.ts
├── domain/
│   ├── normalization.ts
│   ├── state.ts
│   ├── ownership.ts
│   └── exact-integrity.ts
├── history/
│   ├── planner.ts
│   ├── operations.ts
│   ├── canonical.ts
│   ├── lifecycle.ts
│   └── deletion.ts
└── direct-mutations/
    ├── exact.ts
    └── mutation-source.ts
```

## Required PR 2C behavior

For one `updateMany` event:

1. Resolve every targeted record from the event keys using `ItemsService`.
2. Materialize every complete proposed record with `materializeRedirectState`, preserving omitted
   fields, explicit `null`, and falsey values.
3. Apply external ownership decisions per record. Internal Sluggernaut writes must retain the
   existing internal-mutation behavior and must not silently bypass exact validation.
4. Run local exact validation for every resulting exact record.
5. Read non-targeted records needed for conflict checks; do not load the whole collection.
6. Compare resulting records with one another for duplicate active exact origins and, when patterns
   are later supported, equivalent active patterns. Pattern behavior remains out of scope for this
   PR unless the existing event path makes a neutral compatibility decision necessary.
7. Build the complete relevant active exact graph, including edges between records in the same
   mutation set, and validate it once for duplicate origins, self-loops, and cycles.
8. Reject before Directus persists anything whenever the preflight cannot establish integrity.

The plan explicitly does **not** promise all-or-nothing rollback until Directus transaction behavior
for `updateMany` is verified. If the event shape or transaction context cannot support safe
preflight, reject the mutation rather than performing partial validation.

Reuse the existing batched origin-frontier mechanism and its depth limit. Keep persistence thin: the
adapter should fetch records requested by the domain and pass them to domain functions. Do not
reimplement redirect semantics in the adapter.

## Important files and tests

- Plan and contract: `SLUGGERNAUT_REDIRECTS.md`, especially “Bulk mutation contract” and “PR 2”.
- Existing single-item adapter: `src/sluggernaut-hook/redirects/direct-mutations/exact.ts`.
- Pure graph/state APIs: `src/sluggernaut-hook/redirects/domain/`.
- Shared typed service: `src/sluggernaut-hook/redirects/service.ts`.
- Existing adapter tests: `__tests__/redirect-mutation-hooks.test.ts`.
- Domain tests: `__tests__/redirect-domain.test.ts`.

Add focused unit tests for event-shape handling, complete target materialization, targeted versus
non-targeted reads, intra-batch duplicate/cycle detection, batched frontier expansion, absent
origins, transaction/database forwarding, and rejection before persistence. Avoid E2E unless the
Directus event contract cannot be verified at unit level.

Preserve the configured `SLUGGERNAUT_REDIRECTS_COLLECTION`, accountability/schema/database
forwarding, existing history workflows, and the async-local mutation-source decision documented in
`docs/decisions/async-local-mutation-source.md`.

## Completion checklist

- `updateMany` is preflighted before persistence and never silently receives single-item-only
  validation.
- No pattern parser, query-ordering, or unrelated history refactor is introduced.
- `updateMany` remains the only new bulk behavior; `updateMany` rollback guarantees are documented
  only if verified.
- Run `corepack pnpm format`, `corepack pnpm build:utils`, `corepack pnpm lint:fix`,
  `corepack pnpm typecheck`, `corepack pnpm test:unit`, the applicable extension build, and
  `git diff --check`.
- Update the package README, consumer skill, plan, and a scoped Changeset if the consumer-visible
  behavior changes.
