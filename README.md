![Stichting Onderwijs in](https://raw.githubusercontent.com/onderwijsin/.github/main/banner.png)

# Directus Extensions

This repository is a collection of Directus extensions and shared packages maintained by _Onderwijs
in_. Public extensions are opinionated building blocks for use in internal _Onderwijs in_ projects;
private fixtures support repository validation.

All publishable extensions in this repository are distributed as npm packages and installed in the
Directus runtime image. Directus Marketplace availability is not assumed; extensions that use the
trusted, non-sandboxed runtime require a trusted self-hosted installation.

## 📦 What's in the box?

| Package                                                                                                                  | Description                                                                 |
| ------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| [`@onderwijsin/directus-enhanced-server-health-endpoint`](extensions/directus-enhanced-server-health-endpoint/README.md) | Configurable health endpoint based on Directus server checks.               |
| [`@onderwijsin/directus-policies-endpoint`](extensions/directus-policies-endpoint/README.md)                             | Authenticated endpoint for resolving a user's effective policies.           |
| [`@onderwijsin/directus-magic-links-bundle`](extensions/directus-magic-links-bundle/README.md)                           | Passwordless magic-link authentication for Directus frontend clients.       |
| [`@onderwijsin/directus-coolify-deployments-bundle`](extensions/directus-coolify-deployments-bundle/README.md)           | Trigger and inspect frontend deployments through Coolify.                   |
| [`@onderwijsin/directus-loops-bundle`](extensions/directus-loops-bundle/README.md)                                       | Synchronize Loops contact profiles and archive email campaigns in Directus. |
| [`@onderwijsin/directus-sluggernaut-bundle`](extensions/directus-sluggernaut-bundle/README.md)                           | Field-driven slugs, permalinks, redirects, and recalculation for Directus.  |
| [`@onderwijsin/directus-sentry-bundle`](extensions/directus-sentry-bundle/README.md)                                     | Sentry integration bundle for trusted Directus deployments.                 |

The repository also contains supporting workspace packages and private infrastructure for shared
TypeScript configuration and test execution.

## 🧱 Requirements

- Node.js 24.10.0 or newer for local development and CI.
- pnpm 11.20.0 through Corepack.
- Docker Compose for the local Directus stack.
- gitleaks v8.x for local commit hooks.

Enable Corepack once, then install the workspace dependencies:

```sh
corepack enable
pnpm install --frozen-lockfile
```

## 🤖 Extension skills

Install the consumer-facing agent skills for the extensions with:

```sh
npx skills add onderwijsin/directus-extensions
```

To install only one skill, pass its name:

```sh
npx skills add onderwijsin/directus-extensions --skill "<extension-name>"
# npx skills add onderwijsin/directus-extensions --skill directus-e2e-playground
```

These skills provide extension-specific integration guidance for agents working in Directus
projects.

## 🚀 Getting Started

Build the workspace and start the shared local Directus instance:

```sh
pnpm compose:up
```

The stack mounts `extensions/` into Directus and enables extension auto-reload. The local services
are available at:

- Directus: <http://localhost:8055>
- Mailpit: <http://localhost:8025>
- Meilisearch: <http://localhost:7700>

Local data is stored under `.data/` and is ignored by git. Copy `.env.example` to `.env` when local
overrides are needed. The default credentials and secrets are for local development only.

Useful commands:

```sh
pnpm compose:logs
pnpm compose:down
pnpm compose:reset
pnpm dev
```

`pnpm dev` watches all extensions and writes their generated output beside each package manifest.
Directus loads the generated `dist/` directories, not the raw source files.

## ✅ Validation

Apply formatting and lint fixes, then run the complete local validation suite:

```sh
pnpm format:fix
pnpm build:utils
pnpm lint:fix
pnpm lint:actions
pnpm validate:docs
pnpm typecheck
pnpm test:unit
pnpm build
pnpm validate:packages
```

For read-only checks, use `pnpm format` and `pnpm lint`. CI additionally packs each publishable
package, validates its tarball, and runs Directus E2E tests against the packed extension artifact.
The package tarball is the source of truth for release validation.

## 🤖 Extension implementation prompt

Use this prompt when asking an agent to create, migrate, or update an extension:

```text
Use the `authoring-directus-extensions` skill for this task.
Start with `docs/extension-cookbook/index.md` and follow only the relevant articles linked there.
Treat those resources, the official Directus documentation, and nearby extensions as the source of
truth; do not recreate their guidance here.

Inspect the affected extension and a comparable extension before changing code. Keep the
implementation scoped, preserve existing contracts unless the request says otherwise, and update
the package README and matching consumer skill when the public contract changes.

Run the relevant validation from `docs/workspace.md`. Do not commit changes or generated output.

Extension request:
<describe the extension or change here>
```

## 🧰 Supporting Packages

This project contains supporting workspace packages with different publication policies.

| Package                                                                                     | Description                                              |
| ------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| [`@onderwijsin/directus-extension-utils`](packages/extension-utils/README.md)               | Published shared runtime utilities.                      |
| [`@onderwijsin/directus-extension-e2e-playground`](tests/directus-e2e-playground/README.md) | Private hook used by packed-artifact Directus E2E tests. |
| `@workspace/test-utils`                                                                     | Private, test-only workspace utilities.                  |
| `@workspace/typescript-config`                                                              | Private shared TypeScript configuration.                 |

## 📚 Documentation

- [`docs/index.md`](docs/index.md) — documentation navigation and maintainer source-of-truth map.
- [`docs/agent-workflow.md`](docs/agent-workflow.md) — task routing, validation, and handoff.
- [`docs/extension-cookbook/index.md`](docs/extension-cookbook/index.md) — authoritative extension
  cookbook routing.
- [`docs/decisions/index.md`](docs/decisions/index.md) — accepted architecture decisions and ADR
  template.
- [`docs/contributing.md`](docs/contributing.md) — contributor workflow.
- [`docs/security.md`](docs/security.md) — Dependabot, CodeQL, and GitHub Actions security
  expectations.
- [`docs/workspace.md`](docs/workspace.md) — workspace, tools, and commands.
- [`docs/testing.md`](docs/testing.md) — Vitest and Directus integration testing.
- [`docs/publishing.md`](docs/publishing.md) — release checks and publishing.
- [`docs/actions.md`](docs/actions.md) — GitHub Actions guidelines.
- [`docs/environment.md`](docs/environment.md) — local Directus and Compose environment.
- [`docs/docker.md`](docs/docker.md) — local and E2E Compose architecture and operations.
- [`docs/decisions/index.md`](docs/decisions/index.md) — accepted architecture decisions and
  deferred boundaries.

## 🚢 Publishing

For every user-facing extension or package change, create a Changeset locally:

```sh
pnpm changeset
pnpm changeset:status
```

Select the affected package, choose the SemVer impact, and write the release note.
Documentation-only and CI-only changes do not need a Changeset and should use the `no-changeset`
pull request label.

After review and merge, publishing is a manual two-stage flow from `main`. **Prepare release**
consumes the Changesets, versions affected packages, updates changelogs, appends links to the
included commits, and opens or updates a release pull request. After that pull request is merged,
**Publish release** rebuilds and validates the packages, publishes through Changesets, and creates
package-specific tags and GitHub Releases.

The `NPM_TOKEN` GitHub secret is required for publishing and is never stored in the repository. See
[`docs/publishing.md`](docs/publishing.md) for the complete release procedure and rerun behavior.

## 📄 License

MIT. See [`LICENSE`](LICENSE).
