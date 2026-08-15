# AGENTS.md

> Operational contract for coding agents working in this repository.

## Sources and precedence

Use repository guidance with these roles:

1. The user's current request defines the intended outcome and scope. It authorizes an exception
   only where this contract explicitly allows user or maintainer approval.
2. This file defines the mandatory working contract and takes precedence over repository
   documentation when they conflict.
3. [`docs/agent-workflow.md`](docs/agent-workflow.md) routes the task to the required repository
   documentation and defines the delivery process.
4. Topic documentation under `docs/` defines repository contracts and accepted decisions.
5. Existing implementation, tests, and nearby packages reveal conventions not yet documented.

Do not treat an implementation that contradicts this contract or the documentation as a new pattern.
If sources conflict, do not silently choose one: preserve the safer existing contract, report the
conflict, and ask when the answer could change public behavior or compatibility.

## Required workflow

Compose-backed services can take one to eight minutes to become responsive, depending on image and
dependency cache hits. Do not treat an unresponsive Compose service as failed after only one minute;
allow the full startup window before diagnosing the stack. E2E runners must remove their Compose
project and disposable volumes on success, failure, and interruption; do not stop the shared Docker
daemon as part of test cleanup.

For every task:

1. Run `git status --short` and preserve all pre-existing or unrelated changes.
2. Identify the affected files, packages, public contracts, runtimes, and release surfaces.
3. Use the routing table in [`docs/agent-workflow.md`](docs/agent-workflow.md) and read every
   article triggered by the task. Do not rely on memory or on this file as a substitute for the
   docs.
4. Inspect the affected implementation and tests. Before introducing a pattern, inspect a comparable
   implementation elsewhere in the repository.
5. Decide the expected impact on code, tests, documentation, consumer skills, dependencies,
   compatibility, and Changesets before editing.
6. Implement the smallest root-cause change that satisfies the request and documented contracts.
7. Review the complete diff, run applicable validation, and reconcile every impact decision.
8. Use the exact handoff structure in [`docs/agent-workflow.md`](docs/agent-workflow.md).

For extension creation, maintenance, testing, documentation, or restructuring, use the
`authoring-directus-extensions` skill. For a production-readiness or pre-publish review, use the
`auditing-directus-extensions` skill. Skills route the work; `docs/` remains the repository source
of truth.

## Design priorities

When multiple valid solutions exist, prefer, in order:

1. Correctness
2. Small changes
3. Existing patterns
4. Readability
5. Type safety
6. Performance

Keep presentational concerns in components and reusable logic in composables. Preserve existing
route and file naming contracts. Do not perform opportunistic refactors.

## Non-negotiable rules

- Do not introduce breaking UX or API-shape changes without an explicit request and compatibility
  decision.
- Do not implement workarounds, quick fixes, or symptom-masking changes without explicit permission.
  Verify and address the root cause.
- Do not edit `.husky/**` unless explicitly requested.
- Do not edit `.agents/skills/**` unless explicitly requested.
- Do not add dependencies unless explicitly requested and demonstrated to improve codebase health
  and quality.
- Do not change Vitest coverage include paths unless explicitly requested.
- Do not add tests solely to meet coverage thresholds. Add tests for known risks, contracts, or
  regression prevention.
- Do not add global type stubs to fix TypeScript issues unless specifically requested.
- Do not introduce TypeScript assertions or casts unless explicitly requested or approved by the
  human maintainer. Model the types correctly.
- Use Zod for boundary validation where applicable.
- Pin every third-party GitHub Action to a full immutable commit SHA and retain the intended release
  or tag in an inline comment. Mutable refs such as `@v1`, `@v4`, `@main`, branches, and tags are
  prohibited.
- When an extension's public API or consumer-visible behavior changes, update its package README and
  matching installable consumer skill under `skills/` in the same change.
- When work changes, documents, or relies on `packages/extension-utils`, keep
  [`docs/extension-cookbook/extension-utils.md`](docs/extension-cookbook/extension-utils.md), its
  focused articles, public exports, and runtime subpaths synchronized.
- Create one Changeset file per concern. Unrelated package changes require separate Changesets even
  when they affect the same package or have the same release level.
- Do not commit changes. The human collaborator reviews and commits them unless the current request
  explicitly says otherwise.

## Package manager and workspace safety

Follow [`docs/workspace.md`](docs/workspace.md) for the complete tooling contract.

- Use the exact pnpm version declared in `package.json`, invoked as `corepack pnpm ...` in agent-run
  commands. Use `pnpm ...` in user-facing documentation unless Corepack itself is relevant.
- Never install dependencies or modify, delete, relink, or repair `node_modules` in the human
  collaborator's primary checkout.
- Do not override pnpm's configured store or create a repository-local store.
- Run dependency-mutating commands only when the task requires dependency changes. Otherwise keep
  `node_modules`, `pnpm-lock.yaml`, and pnpm configuration unchanged.
- Every dependency addition or change must use a workspace catalog entry, and catalog versions must
  be exact pins rather than ranges.
- If pnpm reports a store mismatch or isolation is unavailable, stop and report it instead of
  modifying the primary checkout.

## Completion gates

A task is complete only when every applicable gate is satisfied or explicitly reported as blocked:

- formatting applied with `corepack pnpm format`;
- lint autofixes applied and lint passing with `corepack pnpm lint:fix`;
- TypeScript checks passing with `corepack pnpm typecheck`;
- unit tests passing with `corepack pnpm test`;
- broader build, package, playground, or packed-consumer checks run when triggered by the change;
- maintainer and consumer documentation synchronized, or a concrete no-doc-impact reason recorded;
- matching consumer skill synchronized when public extension behavior changes;
- proper JSDoc present where applicable for code written or touched;
- runtime and compatibility contracts preserved unless an explicit change was requested; and
- one correctly scoped Changeset per affected public-package concern, or a concrete no-Changeset
  reason recorded.

Never claim success for a skipped or failing check. Include the exact command and blocker in the
handoff.

## Required handoff

Every final handoff must use the applicable exact template in
[`docs/agent-workflow.md`](docs/agent-workflow.md). The requirement is part of the contract, not
optional presentation guidance.

For a change, include all of these sections:

- `Changed`: a list of concrete changes;
- `Validation`: passed, skipped, blocked, or failing checks with exact commands;
- `Contracts and documentation`: compatibility impact, synchronized documentation and consumer
  skills, and the Changeset decision;
- `Risks and follow-up`: remaining risks or `None`; and
- `Commit message`: a ready-to-copy Conventional Commit message in a fenced `text` block.

For a read-only diagnosis, review, or audit, include `Verdict`, `Findings`,
`Validation and evidence`, `Contracts and impact`, `Risks and follow-up`, and
`Suggested commit message`. Use the documented read-only value when there is no coherent change to
commit.

## When to ask

Ask instead of guessing when requirements remain ambiguous after inspection, equally valid
architectural directions would create materially different contracts, a change could break
compatibility, or completion requires broader authority than the user granted.
