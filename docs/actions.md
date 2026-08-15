# GitHub Actions

Keep workflow permissions minimal and pin third-party Actions to full immutable commit SHAs with the
intended release in a comment. Validate workflow syntax with the repository's actionlint setup.

The security, dependency, CodeQL, notification, and release-supporting workflows complement the main
CI workflow. Keep them compatible with the Directus workspace and review changes against the current
packed-artifact and Directus E2E release path.

Never place secrets in workflow source or Compose files. Review permissions, fork behavior, artifact
handling, and untrusted pull-request execution before broadening a workflow.
