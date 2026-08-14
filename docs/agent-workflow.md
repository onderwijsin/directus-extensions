# Agent workflow

This guide is the repository workflow for authoring and auditing Directus extensions. `AGENTS.md`
contains the non-negotiable contract; this document routes work to detailed guidance and defines the
handoff evidence.

## Before editing

1. Run `git status --short` and preserve existing changes.
2. Identify the affected package, Directus extension type, runtime, public contract, tests,
   documentation, skills, Compose integration, and release surface.
3. Read the applicable article in the table below and inspect the implementation and a comparable
   local package when a pattern is needed.
4. Use the Directus documentation MCP for version-sensitive framework facts. Do not invent event
   names, service APIs, permissions, sandbox scopes, package metadata, or loading behavior.
5. Decide implementation, tests, maintainer docs, consumer docs, skills, dependencies,
   compatibility, and Changeset impact before editing.

## Routing

| Work                                               | Read                                                                     |
| -------------------------------------------------- | ------------------------------------------------------------------------ |
| Any repository change                              | This article, affected package/source/tests/docs, and the cookbook index |
| Workspace, scripts, dependencies, generated output | `docs/workspace.md`                                                      |
| Contributions and repository conventions           | `docs/contributing.md`                                                   |
| Local Compose, environment, services, secrets      | `docs/environment.md`                                                    |
| Tests, fixtures, coverage                          | `docs/testing.md`                                                        |
| GitHub Actions or workflow changes                 | `docs/actions.md`, `docs/ci.md`, `docs/security.md`                      |
| Publishing, package metadata, Changesets           | `docs/publishing.md`                                                     |
| Extension authoring                                | `.agents/skills/authoring-directus-extensions/SKILL.md` and cookbook     |
| Production or release audit                        | `.agents/skills/auditing-directus-extensions/SKILL.md` and cookbook      |
| Public extension behavior                          | package README and matching `skills/<name>/SKILL.md`                     |
| `extension-utils`                                  | `docs/extension-cookbook/extension-utils.md` and `guards.md`             |
| Directus-specific behavior                         | `docs/extension-cookbook/official-directus-documentation.md` and MCP     |

Patterns and extension anatomy are provisional until implementation settles them. Do not turn a
single sample extension into a mandatory repository convention without recording the evidence.

## Implementation and review

Prefer the smallest root-cause change. Preserve public behavior unless a compatibility change is
explicitly requested. Keep Directus registration at the entrypoint, use documented services and
accountability, validate external boundaries, and prefer sandbox mode when possible.

Review the complete diff with:

```sh
git diff --check
git diff --stat
git status --short
```

Do not commit changes. Do not edit reference repositories. Do not commit generated output, secrets,
local data, or packed archives.

## Validation baseline

Run the checks applicable to the current repository state:

```sh
corepack pnpm format
corepack pnpm lint:fix
corepack pnpm typecheck
corepack pnpm test
```

The initial CI contract is intentionally only format, lint, typecheck, and test. Package validation,
packed consumer validation, and complex change-aware policies are later CI work.

## Change handoff

Use this structure for changes:

### Changed

- Concrete changes.

### Validation

- Passed, skipped, blocked, or failing checks with exact commands.

### Contracts and documentation

- Compatibility impact, synchronized documentation and skills, and Changeset decision.

### Risks and follow-up

- Remaining risks or `None`.

### Commit message

```text
<type>(<scope>): <subject>
```

For read-only audits, use `Verdict`, `Findings`, `Validation and evidence`, `Contracts and impact`,
`Risks and follow-up`, and `Suggested commit message`.
