# Contributing

This guide is the starting point for changes to the Directus extensions monorepo.

## Before you start

Install the required tooling:

- Node.js `24.10.0` or newer;
- the pinned pnpm version from the root `package.json`, enabled through Corepack; and
- Docker with Docker Compose for local Directus development and E2E tests.

Read [`docs/agent-workflow.md`](agent-workflow.md), [`docs/workspace.md`](workspace.md), and the
documentation for the package or extension you are changing. Start with a clear understanding of the
affected runtime, public API, tests, package output, and release impact.

## Get the repository running

From the repository root:

```sh
corepack enable
pnpm install --frozen-lockfile
pnpm compose:up
```

Use `pnpm dev` for an extension watch loop. The local Directus instance is shared by the extensions;
extensions do not get separate local Compose projects.

## Make a change

1. Run `git status --short` and preserve unrelated changes.
2. Read the applicable source-of-truth documentation before editing.
3. Inspect a comparable implementation and the affected tests.
4. Keep the change focused and preserve unrelated behavior.
5. Update public documentation, consumer skills, exports, and package metadata when the contract
   changes.
6. Add one Changeset per independent public package concern. Documentation-only and private
   workspace changes do not need a Changeset.

Do not migrate legacy extensions while scaffolding a new extension. Keep extension-specific
orchestration in the owning extension and reusable behavior in the appropriate package.

## Required checks

Select local checks using [`agent-workflow.md`](agent-workflow.md#4-validate-and-review). It defines
validation by affected surface, including documentation-only changes and package/E2E checks. Use
[`testing.md`](testing.md#testing-philosophy) for test selection. Required CI and release checks
remain documented in [`ci.md`](ci.md) and [`publishing.md`](publishing.md).

## Pull request checklist

- [ ] The change is focused and unrelated work is preserved.
- [ ] Applicable validation passes.
- [ ] Public exports and runtime boundaries are tested when affected.
- [ ] Documentation and matching consumer skills are synchronized.
- [ ] A correctly scoped Changeset is present when a published package changes.
- [ ] No secrets, local data, generated output, or private test dependencies are included.
