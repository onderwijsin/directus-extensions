# GitHub Actions

Keep workflow permissions minimal and pin third-party Actions to full immutable commit SHAs with the
intended release in a comment. Validate workflow syntax with the repository's actionlint setup.

The existing security, dependency, CodeQL, notification, and release-supporting workflows may be
retained when compatible. `ci.yml` and `ci-yolo.yml` are exceptions: they are copied from the Nuxt
repository and must be redesigned for the intentionally simple first CI version.

Never place secrets in workflow source or Compose files. Review permissions, fork behavior, artifact
handling, and untrusted pull-request execution before broadening a workflow.
