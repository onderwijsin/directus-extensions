# Workspace and tooling

The repository uses the pinned pnpm version in the root `package.json` through Corepack. Agents run
`corepack pnpm ...`; user-facing documentation uses `pnpm ...`.

Dependency verification before scripts is configured to warn rather than reinstall automatically.
Run `pnpm install` explicitly after changing manifests or the lockfile; this keeps non-interactive
hooks from attempting to replace a stale `node_modules` directory without confirmation.

## Workspace

The workspace currently discovers `extensions/*` and `packages/*`. Publishable extensions and
supporting packages must have their own manifests, TypeScript configuration, tests, README, and
appropriate build scripts. `test-utils` is private and must never become a runtime dependency of a
published package.

Use exact catalog versions. Do not add dependencies or modify the lockfile unless the task requires
it. Never repair or replace `node_modules` in the primary checkout.

## Generated output

Do not commit `dist/`, coverage, packed archives, local Compose data, or generated Directus output.
The workspace extension directory may contain built `dist/` output locally because Compose loads it;
it remains generated and should be ignored.

## Commands

```sh
corepack pnpm format
corepack pnpm lint:fix
corepack pnpm typecheck
corepack pnpm test
corepack pnpm test:coverage
corepack pnpm build
corepack pnpm validate:packages
```

Use package filters for focused work. `validate:packages` builds no code itself; run it after
`build`. It packs public packages into a temporary directory, validates archive contents, and runs
`publint --strict`. Clean Directus consumer validation remains a later stage.
