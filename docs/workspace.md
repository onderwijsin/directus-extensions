# Workspace and tooling

The repository uses the pinned pnpm version in the root `package.json` through Corepack. Agents run
`corepack pnpm ...`; user-facing documentation uses `pnpm ...`.

Dependency verification before scripts is configured to fail rather than reinstall automatically.
Run `pnpm install` explicitly after changing manifests or the lockfile. Never repair or replace
`node_modules` in the primary checkout.

## Package layout

| Location                     | Contract                                                                                       |
| ---------------------------- | ---------------------------------------------------------------------------------------------- |
| `extensions/*`               | Publishable Directus extensions. Each owns metadata, source, tests, README, and build scripts. |
| `packages/extension-utils`   | Publishable framework-neutral helpers with `/app`, `/server`, and `/shared` subpaths.          |
| `packages/test-utils`        | Private test fixtures and integration helpers; never a runtime dependency.                     |
| `packages/typescript-config` | Shared TypeScript configuration used by workspace packages.                                    |
| `tests/`                     | Shared setup and isolated Directus E2E orchestration.                                          |

The workspace is discovered from `extensions/*` and `packages/*` in `pnpm-workspace.yaml`. A new
publishable package must be added under one of those paths, use an exact catalog dependency when a
third-party dependency is needed, and include a Changeset for each independent public concern.

## Generated output and primary-checkout safety

Do not commit `dist/`, coverage, packed archives, local Compose data, or generated Directus output.
The workspace extension directory may contain built `dist/` output locally because Compose loads it;
it remains generated and should be ignored.

Do not install dependencies or modify, delete, relink, or repair `node_modules` in the human
collaborator’s primary checkout. If the existing installation is unusable, use an isolated checkout
or worktree with its own installation. If pnpm reports a store mismatch or isolation is unavailable,
stop and report it.

## Commands and order

```sh
corepack pnpm format
corepack pnpm lint:fix
corepack pnpm lint:actions
corepack pnpm validate:docs
corepack pnpm typecheck
corepack pnpm test
corepack pnpm test:coverage
corepack pnpm build
corepack pnpm validate:packages
```

Use `corepack pnpm format` for the check. When formatting changes are intended, run the configured
`oxfmt` command directly after reviewing its output. Use `corepack pnpm lint:fix` before
typechecking and tests when source changes are made. `validate:packages` builds no code itself; run
it after `build`. It packs public packages into a temporary directory, validates archive contents,
and runs `publint --strict`.

Focused examples:

```sh
pnpm --filter @onderwijsin/directus-extension-utils build
pnpm --filter @onderwijsin/directus-extension-e2e-playground test
pnpm --filter @onderwijsin/directus-extension-e2e-playground typecheck
```

For package-facing changes, use this order:

1. `pnpm build`;
2. `pnpm validate:packages`;
3. `pnpm pack:packages <temporary-directory>`; and
4. `pnpm prepare:e2e-consumer <artifacts> <consumer>` followed by `pnpm e2e` when Directus loading
   or extension registration is affected.

Do not run dependency-mutating commands merely to make a check pass. Clean Directus consumer
validation remains a separate release-surface check.
