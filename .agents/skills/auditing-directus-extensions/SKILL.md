---
name: auditing-directus-extensions
description:
  Audit publishable Directus extensions in the onderwijsin/directus-extensions repository for
  production, Marketplace, and release readiness using source, tests, package artefacts, and
  official Directus documentation.
---

# Audit Directus extensions

Perform a read-only, consumer-first audit by default. Do not fix findings, add tests, change
metadata, or create a Changeset unless explicitly requested. A source check is not a release check:
the packed package and Directus loading contract matter.

## Audit boundary and evidence

1. Identify the target extension and confirm its intended Directus type and publication status.
2. Read `AGENTS.md`, `docs/agent-workflow.md`, the applicable cookbook articles, package README,
   consumer skill, source, tests, package metadata, and build configuration.
3. Use the Directus documentation MCP for the exact Directus version and extension type. Consult
   extension overview/CLI, the relevant API or app extension guide, sandbox, including extensions,
   hardened images, security, permissions/accountability, and Marketplace publishing as relevant.
4. State what was not inspected or could not be run. Never infer a pass from skipped evidence.
5. Treat local anatomy/patterns as provisional unless a repository contract explicitly settles them.

## Product and runtime contract

Trace the public contract from package metadata through built output and documented use. Check:

- `directus:extension` type, host range, entrypoints, bundle entries, and sandbox metadata;
- correct registration and lifecycle behavior for the extension type;
- hook event names, payload/meta semantics, cancellation, errors, and recursion risks;
- endpoint routes, authentication, accountability, permissions, and error shapes;
- internal service usage, schema/transaction handling, and request context;
- sandbox restrictions, requested scopes, unavailable Node APIs, and safe failure behavior;
- environment variables, secrets, external services, timeouts, retries, and logging;
- server/Data Studio/browser boundaries and supported Directus/Node versions; and
- behavior during extension load, reload, failure, and recovery.

For sandboxed extensions, verify that code uses only sandbox-supported APIs and that requested scopes
are minimal and accurately documented. For non-sandboxed extensions, treat Marketplace eligibility
and trust configuration as an explicit release consideration, not an assumption.

## Package and Marketplace audit

Inspect the packed artefact, not only the workspace symlink. Verify:

- npm name, version, license, description, `directus-extension` keyword, host range, and type;
- `dist` contents and entrypoint resolution;
- exports and declarations, where applicable;
- runtime dependency classification and absence of private workspace imports;
- absence of source-only, secret, generated, or unnecessary files;
- compatibility with the hardened image's non-root, no-npm runtime; and
- README installation/use instructions against the actual Marketplace and npm contract.

Run the repository package validator after building. It uses a unique temporary directory outside the
checkout, validates package metadata and archive contents, and runs `publint --strict` against each
packed archive. This is not a substitute for a clean Directus consumer: packed installation and
runtime validation remain a separate release gate.

## Tests and documentation

Assess whether tests detect consumer failures rather than merely count coverage. Look for tests of:

- registration and observable hook/endpoint/app behavior;
- malformed inputs and boundary validation;
- permissions, accountability, sandbox scope failures, and external-service failures;
- reload or lifecycle behavior where relevant; and
- the public package rather than only source-internal imports.

Read the README as an unfamiliar Directus operator and the consumer skill as an unfamiliar coding
agent. They must agree on installation, Directus version, configuration, permissions, environment,
security boundaries, limitations, and examples while retaining different audiences.

## Findings and handoff

Start with one verdict: **Publish**, **Publish after fixes**, or **Do not publish yet**. Use the last
verdict when essential tarball, Directus integration, security, or compatibility evidence is missing.

Report meaningful findings with this structure:

```markdown
### [P0|P1|P2|P3] Concise finding title

- Classification: actual bug | plausible risk | documentation issue | skill issue | maintainability concern
- Affected: `path[:line]` and public behavior affected
- Evidence: observed source, test, package, artefact, or command result
- Violated invariant: expected Directus, Marketplace, consumer, or repository contract
- Scenario: realistic failure or misuse path
- Smallest fix: narrowly scoped correction
- Regression/docs: precise test or documentation change
```

Use P0 for release-stopping security/data-loss/universal failures, P1 for likely production breaks,
P2 for material bounded risks or misleading docs, and P3 only for meaningful maintainability or
future-safety improvements. Omit style-only feedback.

Finish with the highest-priority release actions, cookbook conformance, README readiness,
consumer-skill safety, packed-package trust, validation gaps, and the exact read-only handoff
template from `docs/agent-workflow.md`. Use `N/A — read-only assessment; no change to commit` when
there is no coherent fix commit.
