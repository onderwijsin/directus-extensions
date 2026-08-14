# Agent workflow and documentation routing

This guide turns the repository contract into a repeatable task workflow. Use it for every change or
review. `AGENTS.md` contains the non-negotiable rules; this article determines which detailed
repository guidance applies and how to prove the work is complete.

## 1. Establish the task boundary

Before editing:

1. Run `git status --short`. Treat every existing change as user-owned unless the current task
   clearly created it.
2. Name the requested outcome, affected package or system, and files likely to change.
3. Identify possible impact on:
   - public options, exports, components, composables, auto-imports, routes, and behavior;
   - runtime configuration, generated types, secrets, SSR, and Node/Cloudflare portability;
   - dependencies, package metadata, built output, and release scope;
   - tests, fixtures, playgrounds, maintainer documentation, package READMEs, and consumer skills.
4. Select every matching row in the routing table. Multiple rows commonly apply.

Do not start from an isolated file when the behavior crosses a package boundary. Trace the contract
from configuration or public API through runtime behavior, emitted output, tests, and documentation.

## 2. Route the task to its sources of truth

| Task or affected surface                                                     | Required guidance                                                                                                                                             |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Any repository change                                                        | This article and the affected package, source, tests, documentation, and decisions                                                                            |
| Module or package contribution workflow                                      | [`contributing.md`](contributing.md)                                                                                                                          |
| Workspace, dependencies, scripts, installs, generated output, or validation  | [`workspace.md`](workspace.md)                                                                                                                                |
| Any publishable or local Nuxt module work                                    | Use `authoring-nuxt-modules`; start with the [module cookbook index](module-cookbook/index.md)                                                                |
| New publishable module or package-structure change                           | [Package anatomy](module-cookbook/package-anatomy.md)                                                                                                         |
| Migrating an application-local module                                        | [Migration checklist](module-cookbook/migrating-local-modules.md)                                                                                             |
| Module setup, options, runtime registration/config, templates, types, or CSS | [Module entrypoint](module-cookbook/module-entrypoint.md) and [patterns](module-cookbook/patterns-and-conventions.md)                                         |
| `packages/module-utils` or one of its consumers                              | [Module utilities](module-cookbook/module-utils.md), plus [guards](module-cookbook/guards.md) when narrowing runtime values                                   |
| `packages/test-utils` or shared test infrastructure                          | [Test utilities](module-cookbook/test-utils.md)                                                                                                               |
| Tests, fixtures, coverage, or test strategy                                  | [`testing.md`](testing.md) and [module testing](module-cookbook/testing.md)                                                                                   |
| Module playground                                                            | [Playgrounds](module-cookbook/playground.md)                                                                                                                  |
| Public module API or consumer-visible behavior                               | [Documentation and consumer skills](module-cookbook/documentation-and-skills.md)                                                                              |
| Package/release behavior or Changesets                                       | [`publishing.md`](publishing.md)                                                                                                                              |
| GitHub workflows or local Actions                                            | [`actions.md`](actions.md) and [`security.md`](security.md)                                                                                                   |
| Dependencies, security findings, permissions, secrets, or vulnerability work | [`security.md`](security.md)                                                                                                                                  |
| Substantial module, production-readiness, or release audit                   | Use `auditing-nuxt-modules` and its routed references                                                                                                         |
| Directus session authentication or sealed sessions                           | [`decisions/directus-session-auth.md`](decisions/directus-session-auth.md) and [`decisions/directus-sealed-session.md`](decisions/directus-sealed-session.md) |
| Simple rate limiter guarantees                                               | [`decisions/simple-rate-limiter.md`](decisions/simple-rate-limiter.md)                                                                                        |
| Static-text translation compatibility                                        | [`decisions/static-text-i18n-compatibility.md`](decisions/static-text-i18n-compatibility.md)                                                                  |

Read each selected article completely before making its decision. Then inspect nearby code because
the cookbook records required and recurring patterns but cannot enumerate every valid local
convention. A decision record is binding for its feature until the user explicitly requests a new
decision.

In the first progress update before substantive edits, name the selected route and the articles
being used. This gives the collaborator a chance to correct scope without interrupting safe
inspection.

## 3. Form the implementation plan

For every impact category, decide `affected` or `not affected` and why. Keep the reasoning brief,
but do not silently omit a category.

| Impact          | If affected                                                                                   |
| --------------- | --------------------------------------------------------------------------------------------- |
| Implementation  | Change the smallest owning layer and address the verified root cause.                         |
| Tests           | Add or update tests for the changed invariant or regression risk; never for coverage alone.   |
| Maintainer docs | Update the article that defines the changed repository pattern or utility contract.           |
| Consumer docs   | Update the package README for changed public behavior, configuration, compatibility, or APIs. |
| Consumer skill  | Update `skills/<module>/SKILL.md` alongside the README for the same public change.            |
| Package/release | Add a Changeset for each public-package concern under the correct SemVer scope.               |
| Dependencies    | Use an exact catalog pin and verify runtime versus development classification.                |
| Compatibility   | Verify Node, Cloudflare Workers, SSR/client boundaries, and existing public behavior.         |

Documentation synchronization is an impact decision, not a demand for meaningless edits. If no
documentation changes are needed, record the concrete reason in the handoff. If implementation and
documentation disagree, verify runtime behavior and reconcile the source of truth in the same task.

## 4. Implement with repository patterns

- Prefer an existing helper or pattern over a new abstraction when it expresses the same contract.
- Keep orchestration, build-time logic, runtime logic, public types, and presentation in their
  documented locations.
- Validate external boundaries with Zod where applicable. Use focused runtime guards for ordinary
  narrowing and domain predicates for domain-specific shapes.
- Verify behavior from code before changing documentation, and verify documentation before claiming
  a repository convention.
- Preserve all unrelated work and avoid generated files, broad rewrites, and opportunistic cleanup.

When a documented pattern does not fit, do not bypass it silently. Explain why the module's
requirements differ and either preserve the local exception or propose a cookbook update.

## 5. Audit the diff before validation

Run and inspect:

```sh
git status --short
git diff --check
git diff --stat
git diff -- <affected paths>
```

Confirm that:

- every changed file belongs to the task;
- public changes have matching README, consumer-skill, and Changeset decisions;
- module-utils changes have synchronized exports, runtime subpaths, tests, and cookbook references;
- new dependencies use exact catalog entries and the right dependency section;
- generated output and unrelated user changes are absent from the diff; and
- code has applicable JSDoc and no unapproved casts, assertions, stubs, or compatibility breaks.

## 6. Validate in proportion to risk

Use [`workspace.md`](workspace.md) for command order and environment safety. Unless a check is truly
inapplicable or blocked, apply formatting and lint fixes, then run type checking and tests:

```sh
corepack pnpm format
corepack pnpm lint:fix
corepack pnpm typecheck
corepack pnpm test
```

Add targeted tests while iterating. Add recursive builds and package validation for package-facing
changes. Add packed artefact and external-consumer validation for exports, dependencies, emitted
runtime code, or release readiness. Never describe an unrun check as passing.

## 7. Reconcile completion

Before answering, revisit the impact table and completion gates in `AGENTS.md`. Resolve every
applicable item or state the exact blocker. A task is not complete merely because implementation
compiles or the requested file changed.

## 8. Required handoff

Use the change handoff whenever files changed. Use every heading, even for a documentation-only
change or when validation is blocked:

````markdown
### Changed

- List the concrete changes.

### Validation

- Passed: `exact command`
- Not run or blocked: `exact command` — reason

### Contracts and documentation

- Describe public/runtime compatibility impact.
- List synchronized docs and consumer skills, or state why none were needed.
- List Changesets, or state why none were needed.

### Risks and follow-up

- List remaining risks or `None`.

### Commit message

```text
<type>(<scope>): <subject>
```
````

For a read-only diagnosis, review, or audit, use this structure instead:

````markdown
### Verdict

- State the outcome or readiness decision first.

### Findings

- List evidence-backed findings in priority order, or state that none were found.

### Validation and evidence

- Inspected: `paths or artefacts`
- Passed: `exact command`
- Not run or unavailable: `exact command or evidence` — reason

### Contracts and impact

- Describe the affected public/runtime/documentation contracts and whether files were changed.

### Risks and follow-up

- List remaining risks or `None`.

### Suggested commit message

```text
<type>(<scope>): <subject>
```
````

Use `N/A — read-only assessment; no change to commit` when no coherent follow-up commit can be
suggested. A specialized review skill may define additional finding fields or a stricter verdict;
include those inside this assessment structure without dropping its evidence and risk sections.

Allowed Conventional Commit types are `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`,
`ci`, `build`, `perf`, and `revert`. Do not commit the changes unless the user explicitly requests
it; the commit message is a ready-to-copy handoff for the human collaborator.
