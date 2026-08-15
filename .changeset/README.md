# Changesets

Add a changeset for every user-facing extension or package change. Private workspace utilities are
excluded from Changesets and do not need release entries. The publishable
`@onderwijsin/directus-extension-utils` package does require release entries when its public API or
behavior changes.

Each changeset file must cover one concern only. Split unrelated package changes into separate
changeset files, even when they affect the same package or use the same release level.

Use the `no-changeset` pull request label for changes that do not affect a published package, such
as documentation-only or CI-only changes.
