# GitHub Actions

Keep workflow permissions minimal and pin third-party Actions to full immutable commit SHAs with the
intended release in a comment. Workflow syntax is checked locally by lint-staged using the pinned
root `github-actionlint` dependency and remotely by the standalone Actionlint workflow.

The security, dependency, CodeQL, notification, and release-supporting workflows complement the main
CI workflow. Keep them compatible with the Directus workspace and review changes against the current
packed-artifact and Directus E2E release path.

## Adding or changing a workflow

1. Give the workflow one clear responsibility and document it in [`ci.md`](ci.md) when it is part of
   the repository lifecycle.
2. Set top-level `permissions` to the minimum needed and narrow job permissions further when a job
   needs to write contents, pull requests, security events, or notifications.
3. Pin every third-party action to a full commit SHA and retain the human-readable release in an
   inline comment.
4. Use the repository pnpm and Node versions, `pnpm install --frozen-lockfile`, and existing
   artifact conventions.
5. Run `pnpm lint:actions` and inspect fork, merge queue, rerun, artifact, and secret behavior.

Never place secrets in workflow source or Compose files. Review permissions, fork behavior, artifact
handling, concurrency, untrusted pull-request execution, and manual-dispatch branch restrictions
before broadening a workflow.

## Local actions

Composite actions under `.github/actions/` are repository code and should be reviewed and tested
like scripts. Keep their inputs documented, avoid implicit secrets, and preserve explicit output
paths so release and notification jobs remain easy to audit.
