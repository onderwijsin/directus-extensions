# Continuous integration

## Version one

The CI workflow runs a full quality path and then a packed-artifact Directus E2E path:

1. formatting;
2. linting;
3. TypeScript checks; and
4. unit tests with V8 coverage collection;
5. package builds, packed-package validation, and artifact upload; and
6. Directus E2E tests using the packed extension artifact from the quality job.

`ci-yolo.yml` calls the same full workflow. It currently has no change-aware conditionals.

## Later versions

The packed E2E consumer is intentionally not the same as external-consumer validation. It proves
that a packaged extension can be installed into a clean staging consumer and loaded by Directus.
External-consumer validation should separately verify published package installation, exports, and
consumer imports without requiring a Directus instance.
