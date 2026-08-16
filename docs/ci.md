# Continuous integration

## Workflow entry points

| Workflow              | Trigger                                              | Purpose                                              |
| --------------------- | ---------------------------------------------------- | ---------------------------------------------------- |
| `ci.yml`              | Pull request, merge queue, manual, reusable workflow | Quality, package validation, and Directus E2E        |
| `ci-yolo.yml`         | Pull request labeled `YOLO`                          | Quality checks without package or E2E validation     |
| `docs.yml`            | Pull request, merge queue, manual                    | Dependency-free consumer documentation coverage      |
| `actionlint.yml`      | Pull request, merge queue, manual                    | GitHub Actions syntax validation                     |
| `prepare-release.yml` | Manual on `main`                                     | Create or update the Changesets version pull request |
| `publish.yml`         | Merged release PR or manual on `main`                | Validate, publish, and create GitHub releases        |

## Quality checks

The normal CI workflow runs:

1. formatting;
2. linting;
3. TypeScript checks;
4. unit tests with V8 coverage collection;
5. extension-utils and extension builds;
6. packed-package validation;
7. packed artifact creation; and
8. packed artifact upload.

`ci-yolo.yml` skips package builds, package validation, artifact creation, and E2E testing. It is
not sufficient release evidence.

## Directus E2E testing

The E2E job requires the quality job, downloads its packed artifacts, installs them into a clean
temporary consumer, and runs the isolated Directus E2E runner. Directus therefore loads the same
package archives that passed package validation.

The E2E runner starts the isolated Compose project, waits for service readiness, creates the test
data through the Directus API, runs the E2E Vitest project, and removes the Compose project and
disposable volumes on success, failure, or interruption. See [`testing.md`](testing.md) and
[`docker.md`](docker.md) for local execution, service topology, and timeout details.

Workflow syntax and extension documentation coverage run in separate required workflows.
Documentation validation is invoked directly through `node scripts/validate-docs.mjs`, so that
workflow does not install workspace dependencies. It verifies the root package link, package README
and consumer skill presence, package-name and installation references, and trusted-runtime
disclosure for non-sandboxed API extensions. Its failure cases are covered by
`tests/validate-docs.test.ts`.

## Release workflows

`prepare-release.yml` is manually dispatched on `main` and uses Changesets to create or update the
version pull request. After that pull request is merged, `publish.yml` runs the release quality and
package validation path before invoking `pnpm changeset:publish`. A manual publish is accepted only
from `main`.

The publish workflow has a non-canceling concurrency group and notifies Slack only when packages
were actually published. Do not bypass the release workflow by publishing an individual package
manually.
