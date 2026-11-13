# Agent workflow and documentation routing

This guide turns the repository contract into a repeatable task workflow. `AGENTS.md` contains the
non-negotiable rules; this article routes work to detailed repository guidance and defines handoff
evidence.

## 1. Establish the task boundary

Before editing:

1. Run `git status --short` and preserve existing changes.
2. Identify the requested outcome and affected surfaces: code, tests, documentation, runtime, public
   contracts, and release behavior. Inspect only what is relevant to those surfaces.
3. Select every matching row in the routing table. Multiple rows commonly apply.
4. Use the Directus documentation MCP for version-sensitive framework facts. Do not invent event
   names, service APIs, permissions, sandbox scopes, package metadata, or loading behavior.

When the contract crosses a package boundary, trace the affected path through configuration, source,
built output, tests, metadata, and consumer documentation.

## 2. Route the task to its sources of truth

| Work                                               | Read                                                                                                                             |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Any repository change                              | This article, affected source/tests/docs, and [`docs/index.md`](index.md)                                                        |
| Workspace, scripts, dependencies, generated output | [`workspace.md`](workspace.md)                                                                                                   |
| Contributions and repository conventions           | [`contributing.md`](contributing.md)                                                                                             |
| Local Compose, environment, services, secrets      | [`docker.md`](docker.md), [`environment.md`](environment.md), [`security.md`](security.md)                                       |
| Tests, fixtures, coverage                          | [`testing.md`](testing.md) and the relevant cookbook article                                                                     |
| GitHub Actions or workflow changes                 | [`actions.md`](actions.md), [`ci.md`](ci.md), [`security.md`](security.md)                                                       |
| Publishing, package metadata, Changesets           | [`publishing.md`](publishing.md)                                                                                                 |
| Extension authoring                                | `.agents/skills/authoring-directus-extensions/SKILL.md` and [`extension-cookbook/index.md`](extension-cookbook/index.md)         |
| Production or release audit                        | `.agents/skills/auditing-directus-extensions/SKILL.md` and the cookbook                                                          |
| Public extension behavior                          | Package README and matching `skills/<name>/SKILL.md`                                                                             |
| `extension-utils`                                  | [`extension-cookbook/extension-utils.md`](extension-cookbook/extension-utils.md) and [`guards.md`](extension-cookbook/guards.md) |
| Directus-specific behavior                         | [`extension-cookbook/official-directus-documentation.md`](extension-cookbook/official-directus-documentation.md) and MCP         |
| Architecture decision                              | [`decisions/index.md`](decisions/index.md) and the applicable record                                                             |

Read each selected article completely. Nearby implementations are evidence for local patterns, not
permission to contradict a documented contract. Use a decision record when a choice affects multiple
packages, runtime boundaries, security, release behavior, or maintenance impact and cannot be
explained adequately in an implementation comment.

## 3. Plan and implement

Apply the design priorities in `AGENTS.md` and preserve public behavior unless a compatibility
change is explicitly requested. For Directus implementation work, keep registration at the
entrypoint, use documented services and accountability, and validate external boundaries. When
sandbox compatibility is relevant, read
[`decisions/do-not-sandbox-directus-extensions.md`](decisions/do-not-sandbox-directus-extensions.md).

Before editing, decide which tests, documentation, consumer skills, dependencies, and release
metadata need to change for the affected contracts. Use
[`testing.md`](testing.md#testing-philosophy) for test selection. If public behavior changes, update
the package README, matching skill, and Changeset when applicable.

## 4. Validate and review

Choose local validation by the changed surfaces and concrete risks. Use focused file or package
checks when they cover the affected contract; broaden validation when shared behavior or unresolved
risk requires it. Documentation-only changes need formatting, documentation validation, and a review
of links and consistency, rather than builds or test suites. Required CI and release gates remain
unchanged; see [`ci.md`](ci.md) and [`publishing.md`](publishing.md).

| Affected surface                                                                           | Local validation                                                                                                      |
| ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| Any changed files                                                                          | `corepack pnpm format` and diff review                                                                                |
| Documentation                                                                              | `corepack pnpm validate:docs`, links and consistency review                                                           |
| Source or tests                                                                            | Applicable `corepack pnpm lint:fix`, `corepack pnpm typecheck`, and `corepack pnpm test:unit`, or focused equivalents |
| GitHub Actions                                                                             | `corepack pnpm lint:actions` and the review in [`actions.md`](actions.md)                                             |
| Process or filesystem coordination, including locks and marker stores                      | `corepack pnpm build:utils` then `corepack pnpm test:integration`                                                     |
| Public package metadata, exports, dependencies, build output, or runtime behavior          | Build, package, and packed-consumer checks in [`workspace.md`](workspace.md#external-and-directus-validation)         |
| Directus loading, built extensions, runtime integration, Compose services, or E2E behavior | `corepack pnpm test:e2e`; use the packed-consumer path when package loading or artifacts are affected                 |

Build extension-utils before type-aware linting as documented in
[`workspace.md`](workspace.md#working-with-packages-and-extensions). Run
`corepack pnpm test:unit:coverage` when coverage output or coverage-sensitive source changes are
relevant.

Lint is successful only when it reports zero errors and zero warnings. Treat warnings as findings
that must be fixed before handoff; do not describe a warning-producing lint run as passing.

Review the complete diff and final state:

```sh
git diff --check
git diff --stat
git status --short
```

Confirm every changed file belongs to the task, generated output and unrelated work are absent, and
no unrun check is described as passing. Commit only when the user explicitly requests it.

Distinguish demonstrated defects and concrete risks from optional improvements. Keep findings within
the requested scope; a review may conclude that no further changes are needed.

## 5. Required handoff

Use the structures below as guidance, with detail proportional to the task. For small changes, omit
irrelevant sections; avoid empty sections or boilerplate. Always report relevant changes or
findings, validation actually performed with exact commands and results, and concrete risks or
limitations.

For changes, useful sections are:

- `Changed`: concrete changes;
- `Validation`: checks and results with exact commands, including relevant skipped or blocked
  checks;
- `Contracts and documentation`: material compatibility and documentation impact, consumer skills,
  and the Changeset decision;
- `Risks and follow-up`: concrete risks, limitations, and useful next steps; and
- `Commit message`: an optional proposed Conventional Commit message for uncommitted changes.

For committed changes, report the commit hash(es) instead of a proposed commit message.

For read-only diagnoses, reviews, or audits, useful sections are `Verdict`, `Findings`,
`Validation and evidence`, `Contracts and impact`, and `Risks and follow-up`.
`Suggested commit message` is optional when a concrete proposed change makes it useful.
