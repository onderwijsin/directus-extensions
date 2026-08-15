# Publishing

Publishable extension packages must contain valid npm metadata, the `directus-extension` keyword,
`directus:extension` type and host metadata, a built `dist/` directory, a README, and a compatible
license. Marketplace eligibility additionally depends on the extension type and sandbox status.

Sandbox compatibility is optional in this repository. When an extension is non-sandboxed, document
that it requires a trusted Directus installation and cannot be installed where only sandboxed
extensions are permitted. Never publish secrets, local data, source-only files, or private test
dependencies.

## Local release workflow

Changesets describe public package concerns. Add one Changeset per independent package concern; do
not add one for private packages, documentation-only changes, or internal refactors with no public
impact. The root scripts expose the local workflow:

```sh
pnpm changeset
pnpm changeset:status
pnpm changeset:version
pnpm release
```

Use `pnpm changeset:status` before creating a release PR. The automated release process is:

1. manually dispatch `prepare-release.yml` on `main`;
2. review the generated version pull request and its package versions/changelogs;
3. merge the release pull request only after the normal required checks pass;
4. let `publish.yml` validate formatting, linting, typechecking, tests, builds, and package
   archives;
5. publish through `pnpm changeset:publish`; and
6. verify the generated GitHub releases and Slack notification when packages were published.

The release workflow packs each public package into a temporary directory, checks embedded metadata
and archive contents, and runs `publint --strict` against each tarball. CI’s packed E2E job installs
those exact archives into a clean temporary consumer and verifies extension loading through
Directus.

Before publishing, confirm:

- the package name, version, license, `directus:extension` metadata, host range, and `dist/` are
  correct;
- README and consumer skill documentation describe the same public contract;
- no workspace-only dependency or private test utility enters the package;
- the Changeset scope and release level are correct; and
- non-sandboxed extensions document the trusted-installation requirement.

A future external-consumer job should separately verify direct package imports, public subpath
exports, and declarations without requiring a Directus instance.
