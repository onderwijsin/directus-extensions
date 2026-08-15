# Continuous integration

## Version one

The CI workflow runs a full quality path and then a packed-artifact Directus E2E path:

1. formatting;
2. linting;
3. TypeScript checks; and
4. unit tests with V8 coverage collection;
5. package builds, packed-package validation, and artifact upload; and
6. Directus E2E tests using the packed extension artifact from the quality job.

`ci-yolo.yml` calls the same workflow with `yolo: true`. The YOLO path runs formatting, linting,
TypeScript checks, and unit tests, then skips package builds, packed-package validation and upload,
and Directus E2E testing.

Workflow syntax and extension documentation coverage run in separate required workflows on pull
requests and merge queue events. Documentation validation is invoked directly through
`node scripts/validate-docs.mjs`, so the documentation workflow does not install workspace
dependencies.

## Later versions

The packed E2E consumer is already a clean temporary consumer project: CI installs the packed
archives, copies the packed extension into the consumer's Directus extensions directory, and loads
that artifact through Directus. This validates package contents and the Directus loading contract.

Future external-consumer validation would be a smaller, independent package contract check. It would
import the published package root and subpaths directly, verify the public exports and declarations,
and run without requiring a Directus instance. The purpose is to catch package import/export issues
that Directus loading does not exercise, especially for non-extension packages such as
`@onderwijsin/directus-extension-utils`.
