# Workspace and tooling

This repository is a pnpm workspace for publishable Directus extensions and the private packages
that support their development. Read this article for dependency, package-manager, generated-output,
command, or validation work.

## Requirements

- Node.js `24.10.0` or newer;
- pnpm `11.20.0`, activated through Corepack;
- Docker with Docker Compose for local Directus and E2E workflows; and
- Gitleaks `8.x` for local secret detection and commit hooks.

Enable Corepack and install dependencies from the repository root:

```sh
corepack enable
pnpm install --frozen-lockfile
```

Do not add a repository-local pnpm store or override the configured store location. Every
third-party dependency must use an exact workspace catalog entry.

### For agents

Do not install dependencies or modify, delete, relink, or repair `node_modules` in the human
collaborator's primary checkout. If the existing installation is unusable, use an isolated checkout
or worktree with its own installation. If pnpm reports a store mismatch or isolation is unavailable,
stop and report it instead of altering the primary checkout.

Dependency-mutating commands require a dependency or lockfile change. Otherwise keep `node_modules`,
`pnpm-lock.yaml`, and pnpm configuration unchanged. In agent-run commands, use `corepack pnpm ...`
to select the pinned version; user-facing documentation uses `pnpm ...`.

## Repository layout

```text
.
├── .github/                         GitHub Actions, composite actions, and workflow configuration
├── .agents/                         Maintainer and consumer skills
├── docker/                          Shared Compose service definitions
├── docs/                            Repository contract and extension cookbook
├── extensions/
│   └── directus-e2e-playground/     Publishable Directus extension used by E2E checks
├── packages/
│   ├── extension-utils/             Publishable Directus extension utility package
│   ├── test-utils/                  Private Vitest and Directus E2E helpers
│   └── typescript-config/           Private shared TypeScript configuration
├── scripts/                         Build, packaging, documentation, and E2E orchestration
├── tests/                           Shared Vitest setup and isolated E2E Compose definition
├── compose.yaml                     Local development Compose wiring
├── package.json                     Root scripts, tool versions, and package manager pin
├── pnpm-workspace.yaml              Workspace discovery and dependency catalogs
└── pnpm-lock.yaml                   Frozen dependency resolution
```

The workspace discovers `extensions/*` and `packages/*`. A new package in either location is
included by recursive workspace commands. Keep private test infrastructure out of published runtime
dependencies.

## Working with packages and extensions

Run a package script with a pnpm filter:

```sh
pnpm --filter @onderwijsin/directus-extension-utils typecheck
pnpm --filter @onderwijsin/directus-extension-utils build
pnpm --filter @workspace/test-utils typecheck
pnpm --filter @onderwijsin/directus-extension-e2e-playground typecheck
```

Run the workspace checks from the root:

```sh
pnpm format
pnpm lint:fix
pnpm lint:actions
pnpm validate:docs
pnpm typecheck
pnpm test
pnpm test:coverage
pnpm build
pnpm validate:packages
```

The root `build` script runs available package build scripts recursively. `build:utils` and
`build:extensions` select the two publishable package groups used by CI and release validation.
`validate:packages` checks publishable metadata and packed contents; it does not build source first.

## Generated output and checkout safety

Do not commit generated workspace output:

- `dist/`;
- coverage reports;
- packed `*.tgz` archives;
- local Compose data below `.data/`; or
- generated Directus output.

The extension `dist/` directories may exist locally because Compose loads built extensions, but they
remain generated output.

## External and Directus validation

For public package changes, build and inspect the packed artifacts:

```sh
pnpm build
pnpm validate:packages
pnpm pack:packages /tmp/directus-extensions-packages
```

When package loading, extension registration, or packed runtime behavior changes, prepare the clean
E2E consumer and run the Directus E2E suite:

```sh
pnpm prepare:e2e-consumer /tmp/directus-extensions-packages /tmp/directus-extensions-consumer
DIRECTUS_E2E_EXTENSIONS_DIR=/tmp/directus-extensions-consumer/extensions pnpm e2e
```

The CI E2E job uses the same packed-artifact path. See [`testing.md`](testing.md) and
[`docker.md`](docker.md) for the test project, service readiness, cleanup, and timeout contract.

## Tools

- Oxfmt formats source and documentation.
- Oxlint performs linting, including JSDoc checks.
- TypeScript typechecks workspace packages and extensions.
- Vitest runs unit, component, and E2E tests.
- tsdown builds `@onderwijsin/directus-extension-utils`.
- Changesets manages package versions and release notes.
- Publint and the package validation script inspect npm artifacts.
- GitHub Actionlint validates workflow syntax.
- Husky and lint-staged provide local commit hooks.
- Gitleaks detects secrets in local changes.
- Docker Compose runs the Directus development and isolated E2E stacks.

## Validation order

Run the baseline checks from the repository root:

```sh
pnpm format
pnpm lint:fix
pnpm lint:actions
pnpm validate:docs
pnpm typecheck
pnpm test
pnpm build
pnpm validate:packages
```

Add `pnpm e2e` when the change affects Directus loading, built artifacts, runtime integration,
Compose services, or E2E behavior. If a required check cannot run, record the exact command and
blocker; a narrower successful check does not imply that a broader check passed.
