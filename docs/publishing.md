# Publishing

Publishable extension packages must contain valid npm metadata, the `directus-extension` keyword,
`directus:extension` type and host metadata, a built `dist/` directory, a README, and a compatible
license. Marketplace eligibility additionally depends on the extension type and sandbox status.

Sandbox compatibility is optional in this repository. When an extension is non-sandboxed, document
that it requires a trusted Directus installation and cannot be installed where only sandboxed
extensions are permitted. Never publish secrets, local data, source-only files, or private test
dependencies.

Changesets describe public package concerns. The root scripts expose the complete local workflow:

```sh
pnpm changeset
pnpm changeset:status
pnpm changeset:version
pnpm release
```

The release workflow runs repository checks, builds all packages, validates every publishable
package, and packs the artifacts before invoking Changesets publishing. Validation packs each public
package into a temporary directory, checks the embedded metadata and archive contents, and runs
`publint --strict` against the tarball. CI’s packed E2E job already installs packed artifacts into a
clean temporary consumer and verifies extension loading through Directus. A future external-consumer
job would separately verify direct package imports, public subpath exports, and declarations without
requiring a Directus instance.
