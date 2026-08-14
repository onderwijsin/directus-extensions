---
name: auditing-directus-extensions
description:
  Audit publishable Directus extensions in the onderwijsin/directus-extensions repository. Use when
  asked to assess production or release readiness, review a new or substantially changed extension's
  implementation, tests, package, README, or consumer skill, validate an extension before its first
  npm release, or produce a prioritized, actionable audit handoff.
---

# Audit Directus extensions

Perform a consumer-first, evidence-based audit. Determine whether the **packed npm tarball** is safe
to install in an unrelated production Directus application—not merely whether the workspace source
passes checks.

The audit is read-only by default. Do not fix findings, add tests, change package metadata, or
create a Changeset unless explicitly asked. You may create disposable artefacts outside the
repository when validating packed packages.

## Establish the audit boundary

1. Identify the target under `extensions/<name>` and confirm it is publishable rather than
   local-only.
2. Inspect its `package.json`, extension entrypoint, runtime tree, public types/exports, tests,
   fixture/playground, README, and its consumer skill at `skills/<name>/SKILL.md`.
3. Read [`AGENTS.md`](../../../AGENTS.md) and [the agent workflow](../../../docs/agent-workflow.md),
   then use the [cookbook index](../../../docs/module-cookbook/index.md) to select every applicable
   article before judging a pattern. Use [workspace tooling](../../../docs/workspace.md) and
   [publishing](../../../docs/publishing.md) for the actual validation and release contracts.
4. Inspect a comparable published module when the cookbook leaves a choice open. Treat a deviation
   as a finding only when it violates a documented contract, breaks a consumer expectation, or is
   unjustified by the module's requirements.
5. State the audit scope and unavailable evidence. Do not infer a pass from uninspected code,
   generated output, or skipped validation.

## Audit the product contract

Trace each consumer-facing option, export, runtime registration, generated type,
environment/configuration boundary, and documented example from source to emitted package. Check
that:

- Nuxt lifecycle and setup ordering are valid; disabled mode does not register behavior, overwrite
  consumer configuration, or leave stale state. Type templates required by `nuxt prepare` remain
  available before an enabled guard.
- Runtime code is explicit about imports and portable across supported Node and Cloudflare Workers
  targets; it does not rely on workspace aliases, server auto-imports, direct environment reads,
  process-local caches, or Node-only APIs without a documented compatibility boundary.
- SSR, hydration, client/server boundaries, runtime config visibility, and secret handling are
  correct. Private values must never reach public runtime config, client bundles, logs, generated
  templates, or errors.
- Names are isolated: config keys, routes, handlers, auto-imports, components, storage/state keys,
  templates, and plugins do not collide with Nuxt, consumers, or other modules.
- Inputs are validated at relevant external boundaries; malformed values, absent credentials,
  provider failures, timeouts, cancellation, cleanup, and stale asynchronous completions have
  intentional behavior.
- Dependencies and peer/module dependencies match emitted imports and the supported Nuxt/Node
  contract. Public exports and types are intentional, stable, and do not expose internal or
  workspace-only paths.

Exercise sequences where the feature has state or async work. At minimum consider the relevant
cases:

```text
enable -> use -> disable -> re-enable
success -> failure -> recovery
request A -> request B -> B resolves -> A resolves
SSR -> hydration -> client mutation
pack -> clean external Nuxt app -> install -> build -> run
```

Distinguish a verified defect from a plausible risk. For risks, explain the necessary condition
rather than presenting speculation as fact.

## Check cookbook conformance

Compare the module against the cookbook and nearby modules across metadata/options, registration
order, runtime layout, server handlers, auto-imports/components, templates, runtime config,
generated types, enable/disable behavior, logging/errors, package exports/build, tests, fixtures,
and naming.

Report all of the following when present:

- a violated cookbook contract;
- an unnecessary divergence from a useful established pattern;
- an established pattern that would be wrong for this module, with the reason; and
- a defensible new pattern that should be proposed for the cookbook.

Do not recommend copying conventions blindly. Prefer the smallest change that restores the contract
or makes the deviation explicit.

## Evaluate tests by fault detection

Assess whether tests would catch the failures an external consumer is likely to encounter, rather
than counting assertions or coverage. Check observable module behavior, option
normalization/validation, enabled/disabled behavior, runtime registrations, generated declarations,
malformed inputs, failures and recovery, asynchronous ordering, SSR/Nitro integration, and relevant
provider boundaries.

Confirm fixtures use the public package contract where integration matters. Flag source imports,
workspace resolution, hoisting, mocks, or synthetic configuration that could hide a failure in the
packed package. Name the smallest regression test that would demonstrate each important missing
invariant.

## Validate publish artefacts

Inspect the built output and tarball, not just `src/`. Verify package contents, exports,
declarations, runtime subpaths, import resolution, dependency classification, bundle boundaries,
tree-shaking expectations, and the absence of private workspace imports or unnecessary
internal/source files.

Use the repository's documented package validation path where practical. Run the required
build/preparation steps first, then package and validate with a unique temporary directory outside
the checkout:

```sh
corepack pnpm build:utils
corepack pnpm dev:prepare
corepack pnpm build
corepack pnpm pack:packages /tmp/<unique-audit-dir>
corepack pnpm validate:external-consumer --packages-dir=/tmp/<unique-audit-dir>
```

Do not install, relink, repair, or otherwise mutate `node_modules` in the primary checkout. If the
environment cannot run a step, report it as unverified with the blocker; do not substitute
workspace-symlink success for tarball validation.

## Review public documentation and the consumer skill

Read the README as the only guide available to an unfamiliar application developer. Verify install
and registration steps, requirements/compatibility, complete options and defaults, disabled
behavior, runtime/server config, secrets, public APIs, common examples, errors/limitations,
external-service requirements, security expectations, and links/code examples against
implementation.

Read `skills/<name>/SKILL.md` as the only instruction set available to a coding agent integrating or
maintaining an application that uses the module. It must be concise consumer guidance, not
duplicated maintainer documentation. It must use only public packages/APIs and must not encourage
direct internal imports, generated-file edits, abstraction bypasses, secret exposure, or
unsupported/deprecated patterns. Cross-check it against the README while preserving their different
audiences.

For public-documentation conventions, link reviewers to
[documentation and skills](../../../docs/module-cookbook/documentation-and-skills.md) instead of
restating it.

## Deliver an actionable handoff

Start with the verdict: **Publish**, **Publish after fixes**, or **Do not publish yet**. Use the
latter for release-blocking defects or when essential consumer/package evidence is unavailable; use
“Publish after fixes” for bounded, non-blocking work. Do not call something publishable while
omitting an essential tarball check without clearly qualifying the verdict.

For each meaningful finding, use this exact structure:

```markdown
### [P0|P1|P2|P3] Concise finding title

- Classification: actual bug | plausible risk | documentation issue | skill issue | maintainability
  concern
- Affected: `path[:line]` (and public API/behaviour affected)
- Evidence: observed implementation, test, package, or command result
- Violated invariant: expected consumer or cookbook contract
- Scenario: realistic failure or misuse path
- Smallest fix: narrowly scoped correction
- Regression/docs: precise test and/or documentation change
```

Use `P0` for a release-stopping security, data-loss, or universal runtime break; `P1` for a likely
production break or unsafe public contract; `P2` for a material but bounded risk or misleading
documentation; and `P3` only when it materially improves future safety or maintainability. Omit
style-only feedback.

Finish with:

1. the 3–5 highest-priority release actions, ordered by severity;
2. cookbook conformance: yes / qualified yes / no, with the pivotal reason;
3. README readiness for an unfamiliar external developer: yes / qualified yes / no;
4. consumer-skill safety and usefulness for an unfamiliar coding agent: yes / qualified yes / no;
   and
5. whether you would trust the packed package in an unrelated production Nuxt application, including
   any unverified validation.

If there are no findings, say what was inspected and validated so the next agent can trust the
conclusion.

Deliver the verdict, findings, validation evidence, contract impact, risks, and suggested commit
message inside the read-only assessment handoff defined by
[`docs/agent-workflow.md`](../../../docs/agent-workflow.md). Use
`N/A — read-only assessment; no change to commit` when there is no coherent fix commit to suggest.
