# Working on Directus extensions

> Operational contract for agents working in this repository.

This pnpm workspace contains publishable Directus extensions in `extensions/`, shared utilities in
`packages/extension-utils`, and private development and test infrastructure.

## Sources and precedence

1. The user's current request defines the outcome and scope and takes precedence over repository
   guidance.
2. This file sets repository constraints; follow more specific applicable `AGENTS.md` instructions
   within their scope.
3. [Agent workflow](docs/agent-workflow.md) owns task phases, required skills and documentation
   routing.
4. Topic documentation under `docs/` defines contracts, runbooks and accepted decisions.
5. Manifests, effective configuration, code and tests establish current behavior and reveal local
   conventions where guidance leaves a gap.

When guidance and implementation disagree, establish the intended contract before changing behavior.
Existing code does not authorize a conflicting pattern. Resolve clear changes within scope and
surface unresolved conflicts that affect public behavior or compatibility.

## Required workflow

For every task, follow the workflow's plan, implement, review, cleanup and handoff phases, including
its five mandatory workflow skills. Read the routed documentation and relevant skill references
before making the decisions they govern. For TypeScript code, configuration or convention decisions,
also apply
[TypeScript conventions across phases](docs/agent-workflow.md#typescript-conventions-across-phases).

## Design priorities

Choose the smallest correct, maintainable solution. Prefer correctness, small changes, existing
patterns, readability, type safety and performance, in that order. Reuse existing capabilities; add
abstractions, defensive code, configuration or refactors only for a concrete current need. Readable
code matters more than fewer lines.

Keep presentation in components and reusable logic in composables. Preserve route and file naming
contracts and keep cleanup within scope. A review may conclude **no further changes needed**.

## Safety and compatibility

- Preserve unrelated work and supported UX, API shapes, runtime and compatibility contracts.
  Breaking changes need an explicit request and compatibility decision.
- Fix the cause at its owning boundary. Workarounds or symptom-masking changes require explicit
  permission.
- Validate untrusted input at boundaries with Zod where applicable. Preserve authorization,
  supported failures and resource cleanup.
- Changes to `.husky/**`, `.agents/skills/**` or Vitest coverage include paths require explicit task
  scope. Preserve checks rather than weakening them to make a change pass.
- Model types correctly. TypeScript assertions and casts require explicit request or maintainer
  approval; global type stubs require an explicit request.
- Dependency additions require an explicit request and a demonstrated codebase benefit.
- Pin every third-party GitHub Action to a full immutable commit SHA, retaining the intended release
  or tag in an inline comment.

## Public packages and documentation

- For an extension's public API or consumer-visible behavior change, update its package README and
  matching installable consumer skill under `skills/` in the same change. Follow the
  [consumer documentation contract](docs/extension-cookbook/documentation-and-skills.md).
- For work that changes, documents or relies on `packages/extension-utils`, keep the
  [extension-utils guide](docs/extension-cookbook/extension-utils.md), focused articles, public
  exports and runtime subpaths synchronized.
- Add one Changeset per independent public-package concern when required by
  [publishing](docs/publishing.md). Unrelated concerns need separate files even for the same package
  and release level; private packages never receive Changesets.

## Package manager and workspace safety

Follow [workspace](docs/workspace.md) for tooling, package boundaries and dependency rules. Use the
root Node requirement and exact pnpm pin, invoking agent commands through `corepack pnpm ...`.
User-facing command examples use `pnpm ...`.

Preserve the configured external pnpm store and exact workspace catalog pins. Dependency-mutating
commands require dependency or lockfile work; otherwise leave `node_modules`, `pnpm-lock.yaml` and
pnpm configuration unchanged. Never install, delete, relink or repair `node_modules` in the human
collaborator's primary checkout. Use an isolated checkout when needed; stop and report a store
mismatch or unavailable isolation instead of altering the primary installation.

## Completion and handoff

Select local checks for the task's changed or explicitly reviewed surfaces and affected consumers
using [verification selection](docs/testing.md#selecting-verification-for-a-change). Unrelated dirty
files do not expand that scope; required CI and release gates remain in force. Follow the
[testing policy](docs/testing.md#choosing-and-maintaining-tests) before adding permanent tests.

Finish when the requested outcome is checked, the scoped diff is reviewed, affected contracts,
documentation and consumer skills agree, applicable JSDoc is present, and required Changesets are
included. Follow the workflow's [handoff guidance](docs/agent-workflow.md#5-required-handoff) for
actual check results and material limitations. Never claim success for a skipped or failing check.
Commit, push, create PRs, publish or deploy only when requested; existing authorization remains
valid.

## When to ask

Ask when missing information or an unresolved conflict materially affects scope, correctness,
compatibility or another consequential decision, or when required work exceeds the authority
granted. Resolve routine choices from repository evidence and continue authorized work.
