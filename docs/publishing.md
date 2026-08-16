# Publishing

Publishing uses Changesets to prepare a version pull request and GitHub Actions to publish the
merged release. Packages are never published from a developer machine.

Read this article when a change affects a publishable package, Changeset, release workflow, package
artifact, npm publication, Git tag, GitHub Release, or release notification.

## Package requirements

Publishable extension packages must contain valid npm metadata, the `directus-extension` keyword,
`directus:extension` type and host metadata, a built `dist/` directory, a README, a changelog, and a
compatible license. Marketplace eligibility additionally depends on the extension type and sandbox
status.

Sandbox compatibility is optional in this repository. When an extension is non-sandboxed, document
that it requires a trusted Directus installation and cannot be installed where only sandboxed
extensions are permitted. Never publish secrets, local data, source-only files, or private test
dependencies.

## Local developer workflow

When a change affects a published package, create a Changeset before opening the pull request:

```sh
pnpm changeset
pnpm changeset:status
```

Select every affected publishable package, choose the appropriate SemVer impact, and write a concise
release note. Commit the generated `.changeset/<name>.md` file with the code change. Changesets
posts the proposed release impact on the pull request. Documentation-only, CI-only, and private
workspace changes do not need a Changeset.

Use one Changeset file per concern. Do not combine unrelated package changes into one release note,
even when they affect the same package or use the same release level.

Do not run `changeset:version` or `changeset:publish` locally. Those commands belong to the GitHub
Actions release flow.

## Release flow

### 1. Prepare the release

Run `prepare-release.yml` manually from `main`. The workflow consumes the pending Changesets,
updates affected package versions and changelogs, removes the consumed Changeset files, and creates
or updates the `Publish new package versions` pull request.

The generated pull request is labeled `automated` and `no-changeset`. Review its versions,
changelogs, package metadata, and complete CI result before merging it.

### 2. Publish the release

When the version pull request is merged into `main`, `publish.yml` runs automatically. A manual
dispatch is permitted only on `main`.

Before publishing, the workflow runs the release quality gate:

```sh
pnpm format
pnpm lint
pnpm typecheck
pnpm test:coverage
pnpm build:utils
pnpm build:extensions
pnpm validate:packages
pnpm pack:packages "$RUNNER_TEMP/packages"
```

The workflow then invokes `pnpm changeset:publish` through the Changesets GitHub Action. Changesets
publishes only versions included in the release and not already present on npm. Successful releases
create package-specific Git tags and GitHub Releases. Re-running the workflow skips versions and
GitHub Releases that already exist.

The release workflow sends the published package list to the Slack notification workflow. Slack
notifications require `ONDERWIJSIN_SLACK_APP_OAUTH_TOKEN` and `SLACK_DEPLOYMENTS_CHANNEL_ID`.

## Checks and evidence

| Stage                | Checks                                                                                           | Purpose                                                 |
| -------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------- |
| Pull request         | Formatting, linting, typechecking, tests, package validation, and applicable E2E checks          | Protect the change before merge                         |
| Version pull request | The normal required pull request checks                                                          | Validate generated versions and changelogs              |
| Publish workflow     | Formatting, linting, typechecking, covered tests, builds, package metadata, and packed artifacts | Protect the exact merged release before npm publication |
| Publish workflow     | Changesets publish and GitHub Releases                                                           | Publish versions and create release records             |

The package validation step checks metadata, required files, packed contents, private dependency
leaks, and Publint output. The packed E2E job in the normal CI workflow installs those exact
archives into a clean consumer and loads them through Directus.

## Before requesting a release

Confirm:

- package name, version, license, `directus:extension` metadata, host range, and `dist/` are
  correct;
- README, changelog, and matching consumer skill describe the same public contract;
- no workspace-only dependency or private test utility enters the package;
- the Changeset scope and release level are correct; and
- non-sandboxed extensions document the trusted-installation requirement.

The release process is complete only when the merged release has passed its CI quality gate, the
package publication succeeds, and the generated GitHub Release is available.
