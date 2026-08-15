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

## Quality and E2E phases

The normal CI workflow runs a full quality path and then a packed-artifact Directus E2E path:

1. formatting;
2. linting;
3. TypeScript checks;
4. unit tests with V8 coverage collection;
5. extension-utils and extension builds;
6. packed-package validation;
7. packed artifact upload; and
8. Directus E2E tests using those packed artifacts in a clean temporary consumer.

The E2E job requires the quality job and downloads its artifacts. This ensures Directus loads the
same package output that passed archive validation. `ci-yolo.yml` intentionally skips steps 5–8 and
is not sufficient release evidence.

Workflow syntax and extension documentation coverage run in separate required workflows.
Documentation validation is invoked directly through `node scripts/validate-docs.mjs`, so that
workflow does not install workspace dependencies.

## Release workflows

`prepare-release.yml` is manually dispatched on `main` and uses Changesets to create or update the
version pull request. After that pull request is merged, `publish.yml` runs the complete quality and
package path before invoking `pnpm changeset:publish`. A manual publish is accepted only from
`main`.

The publish workflow has a non-canceling concurrency group and notifies Slack only when packages
were actually published. Do not bypass the release workflow by publishing an individual package
manually.

## Later validation

The packed E2E consumer is already a clean temporary consumer project: CI installs the packed
archives, copies the packed extension into that consumer’s Directus extensions directory, and loads
the artifact through Directus. This validates package contents and the Directus loading contract.

Future external-consumer validation would be a smaller, independent package contract check. It would
import the published package root and subpaths directly, verify public exports and declarations, and
run without requiring a Directus instance. This is especially important for
`@onderwijsin/directus-extension-utils`.
