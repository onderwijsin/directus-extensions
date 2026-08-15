# Directus extensions monorepo scaffold

This is the target architecture and implementation sequence for the repository. It is intentionally
not a second task list. The plan records the decisions already made, the contracts we are building,
and the boundaries that should remain open until implementation gives us evidence.

## Direction

We are building a publishable Directus extension monorepo for Onderwijs in. The first working slice
will be deliberately small:

1. repository and maintainer documentation;
2. a publishable `extension-utils` package containing reusable runtime helpers;
3. one sample hook extension consuming `extension-utils`; and
4. one local Directus 12.2.0 development instance that loads the extension from the workspace.

There will be no initial migration of legacy extensions. The sample hook exists only to prove that
workspace packages, extension builds, Directus loading, and local development work together.

## Explicit boundaries

- `directus-extensions-legacy` and `tio-directus` are read-only references.
- No real product extension is part of the first slice.
- No legacy extension is migrated as part of scaffolding.
- Directus has one shared local development instance; separate per-extension environments are not
  part of this repository.
- Extension conventions are provisional until several extensions give us evidence for a stable
  pattern. Documentation must distinguish settled contracts from current working guidance.
- We do not require API extensions to be sandbox-compatible. The repository prioritizes developer
  experience, maintainability, and access to the full Directus extension API over the default
  sandboxed Marketplace installation model. See the accepted decision in
  `docs/desicions/do-not-sandbox-directus-extensions.md`.

## Repository shape

```text
.
├── extensions/
│   └── sample-hook/
│       ├── src/index.ts
│       ├── __tests__/
│       ├── README.md
│       ├── CHANGELOG.md
│       ├── package.json
│       └── tsconfig.json
├── packages/
│   ├── extension-utils/                 # publishable
│   ├── test-utils/                      # private, scaffolded without utilities
│   └── typescript-config/
├── skills/                              # consumer-facing extension skills
├── .agents/skills/                      # maintainer-facing authoring/auditing skills
├── docs/                                # repository contracts and cookbook
├── compose.yaml                         # single local Directus stack
├── Dockerfile                           # only if needed for the hardened dev image
└── SCAFFOLD.md
```

This structure is a starting point, not a universal extension anatomy rule. The official
`directus:extension` metadata and the Directus CLI scaffold remain authoritative for each extension
type. We will settle local conventions as the sample and later extensions are implemented.

## Package naming

The naming decision is narrow. We need to confirm the npm scope and whether the repository-wide
prefix should be used consistently:

- recommended publishable utility: `@onderwijsin/directus-extension-utils`;
- recommended sample package: `@onderwijsin/directus-extension-sample-hook`; and
- required Marketplace keyword: `directus-extension` in each published extension manifest.

The scoped form gives Onderwijs in ownership and avoids collisions. An unscoped alternative would be
`directus-extension-<name>`, which makes Marketplace naming familiar but offers less namespace
protection. Unless this is rejected, implementation should use the scoped names above. The utility
package is a normal npm package and does not itself need to be a Marketplace extension.

## Local Directus development

### Pinned runtime

Use `directus/directus:12.2.0` for local development. The local loop does not need the hardened
image, and the regular image keeps Compose debugging and extension loading straightforward. Hardened
image validation remains a later production-image concern.

### Services

The first stack includes:

- Directus 12.2.0 development image;
- PostgreSQL with PostGIS;
- Valkey/Redis-compatible cache;
- S3-compatible object storage;
- Mailpit; and
- Meilisearch.

pgAdmin is intentionally excluded. Database access can remain available through the database client,
Directus, or a later explicitly requested tool.

Use health-gated dependencies, persistent `.data` directories, safe local defaults, and an explicit
environment contract. Secrets and machine-specific values must not be committed.

### Compose mount options

Directus loads a local extension from a directory containing at least `package.json` and `dist/`.
The practical choices are:

1. **Build/watch into the workspace extension directory — recommended.** Each extension runs its
   build or watch script and writes `dist/` beside its `package.json`; Compose mounts
   `./extensions:/directus/extensions`. This matches Directus's documented loading model, supports
   `EXTENSIONS_AUTO_RELOAD`, and keeps local development close to the eventual package layout.
2. **Build into a generated staging directory.** A root script builds all selected extensions into
   `.local/extensions`, and Compose mounts that directory. This gives a clean separation between
   source packages and runtime artefacts, but needs orchestration and can obscure which output is
   currently loaded.
3. **Build a custom development image.** A Dockerfile copies package output into the hardened image.
   This is closest to production and useful for validating image installation, but slower for the
   edit/build/reload loop. It is required for npm-installed extensions in hardened images, not for
   the first workspace-mounted development loop.

Do not mount raw `src/` files and expect Directus to compile them. Do not rely on installing npm
packages at container startup: hardened images intentionally do not include npm/npx. Start with
option 1, and add option 3 later for production-image and packed-package validation.

## Implementation slices

The work proceeds one slice at a time. The ordering is intentionally pragmatic rather than a claim
that every later design is already settled.

### Slice A — Repository documentation and maintainer skills

- Rewrite the agent workflow and cookbook routing for Directus extensions.
- Maintain repository-level guidance for workspace, contributions, environment, testing, actions,
  CI, publishing, and security.
- Rewrite framework-specific details using Directus documentation and the Directus CLI/package
  model.
- Finish `.agents/skills/authoring-directus-extensions`.
- Port and finish `.agents/skills/auditing-directus-extensions` as a Directus audit guide.
- Mark extension anatomy and patterns as provisional guidance until implementation settles them.

Done means every workflow link resolves, repository guidance describes the current Directus
workflow, and both maintainer skills can route an agent from request to evidence-backed handoff.

### Slice B — `extension-utils` boilerplate

- Create the publishable package with exact metadata, exports, TypeScript configuration, README, and
  changelog.
- Provide generic primitive guards with Directus-neutral naming and documentation. Their semantics
  are framework-independent.
- Add focused Vitest coverage for every public guard and package exports.
- Keep the package free of Directus server, browser, or Node-only assumptions unless a later utility
  has an explicit runtime subpath and compatibility contract.
- Add a Changeset when the public package is introduced.

### Slice C — Sample hook extension

- Scaffold one hook extension that logs after `items.create`, `items.update`, and `items.delete`.
- Add `extension-utils` as a real workspace runtime dependency.
- Keep the behavior intentionally observable and small, so the setup—not product behavior—is what
  the tests prove. This sample is non-sandboxed because the utility dependency is part of the setup
  contract and the repository does not require sandbox compatibility.
- Verify Directus metadata, build output, local loading, and auto-reload.
- Add package README, consumer skill, tests, and a Changeset if it is publishable.

### Slice D — Single local Directus instance

- Implement the Compose stack described above.
- Add root commands for starting, stopping, logs, health, and a narrowly scoped reset.
- Build/watch the sample extension into the mounted extension directory.
- Verify the sample hook against the running Directus instance.
- Document the local ports, environment variables, storage, Meilisearch, Mailpit, and hardened-image
  constraints.

### Slice E — CI and release validation

The current CI intentionally validates the repository as a publishable Directus workspace:

- format;
- lint;
- typecheck;
- test with V8 coverage collection;
- package builds;
- packed-package metadata and tarball validation;
- packed-artifact upload; and
- Directus E2E tests using the packed extension artifact.

The YOLO workflow keeps the quality path while skipping package builds, packed-package validation,
artifact upload, and Directus E2E tests. The release flow runs the same checks before Changesets
publishing.

### Slice F — Later release and distribution hardening

Deferred until the first working slice is stable:

- independent external-consumer checks that import the published package root and subpaths directly,
  including its public types, without relying on Directus extension discovery;
- custom-image and Marketplace installation validation, including hardened-image constraints;
- richer CI change detection and policy when repository scale justifies it;
- broader extension-type examples; and
- settled extension anatomy and patterns.

## Documentation contracts

Every publishable extension has two audiences:

- `README.md` explains installation and use to a Directus developer/operator;
- `skills/<extension-name>/SKILL.md` explains safe integration and maintenance to an agent.

They must agree on the public contract but must not expose internal workspace paths or maintainer
implementation details. Maintainer workflows and cookbook articles live in `docs/`; they are not
consumer documentation.

## Directus sources of truth

Use the Directus documentation MCP and official docs for framework facts, especially:

- extension overview, quickstart, CLI, and bundles;
- API extensions, hooks, services, and sandbox;
- including extensions and hardened images;
- Marketplace publishing metadata;
- permissions, accountability, errors, configuration, and security; and
- Directus 12 release and breaking-change documentation.

Reference repositories are qualitative sources for workflow, package, CI, and documentation
practices. Their framework implementation details must be translated, not copied. The legacy
extensions project is a reference for the relationship between workspace packages, Compose, and a
Directus service, not a quality or architecture authority.
