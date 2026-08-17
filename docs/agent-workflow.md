# Agent workflow and documentation routing

This guide turns the repository contract into a repeatable task workflow. `AGENTS.md` contains the
non-negotiable rules; this article routes work to detailed repository guidance and defines handoff
evidence.

## 1. Establish the task boundary

Before editing:

1. Run `git status --short` and preserve existing changes.
2. State the requested outcome and identify the affected package, extension type, runtime, public
   contract, tests, documentation, skills, Compose integration, and release surface.
3. Select every matching row in the routing table. Multiple rows commonly apply.
4. Use the Directus documentation MCP for version-sensitive framework facts. Do not invent event
   names, service APIs, permissions, sandbox scopes, package metadata, or loading behavior.
5. Decide implementation, tests, maintainer docs, consumer docs, skills, dependencies,
   compatibility, and Changeset impact before editing.

Trace behavior across configuration, source, built output, tests, package metadata, and consumer
documentation. Do not start from an isolated file when the contract crosses a package boundary.

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
packages, runtime boundaries, security, release behavior, or maintenance impact.

## 3. Plan and implement

Prefer the smallest root-cause change. Preserve public behavior unless a compatibility change is
explicitly requested. Keep Directus registration at the entrypoint, use documented services and
accountability, and validate external boundaries. For this repository’s accepted sandbox trade-off,
read
[`decisions/do-not-sandbox-directus-extensions.md`](decisions/do-not-sandbox-directus-extensions.md).

Before editing, decide whether each category is affected: implementation, tests, maintainer docs,
consumer docs, consumer skills, package/release, dependencies, and compatibility. If public behavior
changes, update the package README, matching skill, and Changeset when applicable.

## 4. Validate and review

Run the applicable checks:

```sh
corepack pnpm format
corepack pnpm build:utils
corepack pnpm lint:fix
corepack pnpm typecheck
corepack pnpm test:unit
```

Lint is successful only when it reports zero errors and zero warnings. Treat warnings as findings
that must be fixed before handoff; do not describe a warning-producing lint run as passing.

Add focused package, packed-consumer, or E2E checks when the change affects those surfaces. Review:

```sh
git diff --check
git diff --stat
git status --short
```

Confirm every changed file belongs to the task, generated output and unrelated work are absent, and
no unrun check is described as passing. Do not commit changes.

## 5. Required handoff

For changes, use `Changed`, `Validation`, `Contracts and documentation`, `Risks and follow-up`, and
`Commit message`. For read-only audits, use `Verdict`, `Findings`, `Validation and evidence`,
`Contracts and impact`, `Risks and follow-up`, and `Suggested commit message`.
