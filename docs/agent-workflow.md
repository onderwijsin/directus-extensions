# Agent workflow and documentation routing

Use this workflow for every repository task: plan, implement, review, cleanup, handoff.
[AGENTS.md](../AGENTS.md) holds repository constraints; this guide owns the task sequence, required
skills and documentation routes.

## Required skills

Read the five workflow skills below and apply them in their phases. Keep each pass within the
requested scope; no change needed is a valid conclusion.

| Skill                                                                 | Phase and purpose                                                                        |
| --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| [implement-simply](../.agents/skills/implement-simply/SKILL.md)       | Plan and implement the simplest sufficient solution using existing capabilities.         |
| [review-code-bloat](../.agents/skills/review-code-bloat/SKILL.md)     | Review whether capabilities, layers and support code earn their maintenance cost.        |
| [review-code-hygiene](../.agents/skills/review-code-hygiene/SKILL.md) | Review clarity, responsibilities, coupling, types and error ownership in necessary code. |
| [review-test-value](../.agents/skills/review-test-value/SKILL.md)     | Review meaningful failure protection, independent expectations and overlapping evidence. |
| [clean-code](../.agents/skills/clean-code/SKILL.md)                   | Apply justified findings through small changes and proportionate verification.           |

For documentation-only work, apply simplicity, necessity and clarity to the instructions and their
routes; assess verification without expanding into unrelated tests. For read-only work, implement
means carry out the investigation, and cleanup means select justified recommendations without
editing. Read relevant skill references before the decisions they govern.

### TypeScript conventions across phases

For TypeScript code, including Vue scripts and tests, TypeScript configuration or coding-convention
decisions, also read [typescript-conventions](../.agents/skills/typescript-conventions/SKILL.md).
Apply the relevant reference branches during planning, implementation, review and cleanup; it adds
no phase. Resolve applicable contracts and effective compiler, module, formatter and linter
configuration first. Repository contracts, installed versions and framework guidance govern; skill
examples fill gaps without authorizing tooling or architecture migrations.

## 1. Plan

Use `implement-simply` to establish the outcome and choose a direct approach.

1. Read the request and applicable `AGENTS.md` files. Run `git status --short` and identify existing
   work before editing.
2. Identify the observable result, owning files/packages, runtimes and public or release surfaces.
   Inspect relevant implementation, tests, helpers and effective configuration; trace callers,
   exports and registrations far enough to establish the affected boundary.
3. For every task, read the [cookbook index](extension-cookbook/index.md), the
   [extension-utils guide](extension-cookbook/extension-utils.md) and their task-relevant subpages
   before choosing an implementation. Select every matching documentation route below and read its
   articles; use the [documentation index](index.md) for further topic routes. Use the Directus
   documentation MCP for version-sensitive framework facts under the official-documentation route.
4. Decide the impact on code, tests, documentation, consumer skills, dependencies, compatibility and
   Changesets. Select checks using
   [verification selection](testing.md#selecting-verification-for-a-change).

Keep planning proportional. Before substantive edits, name the scope, relevant routes and skills in
a brief progress update. Proceed when the outcome, owning boundary, applicable contracts and
verification path are clear.

### Documentation routes

| Task or affected surface                                                 | Read                                                                                                                                                                                |
| ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Workspace, package boundaries, scripts, dependencies or generated output | [Workspace](workspace.md)                                                                                                                                                           |
| Contributions and repository conventions                                 | [Contributing](contributing.md)                                                                                                                                                     |
| Tests, fixtures, coverage or verification selection                      | [Testing](testing.md) and the relevant cookbook article                                                                                                                             |
| Local Compose, services, environment or secrets                          | [Docker](docker.md), [environment](environment.md), [security](security.md)                                                                                                         |
| GitHub Actions or workflows                                              | [Actions](actions.md), [CI](ci.md), [security](security.md)                                                                                                                         |
| Publishing, package metadata, artifacts or Changesets                    | [Publishing](publishing.md), [workspace](workspace.md)                                                                                                                              |
| Extension creation, maintenance, testing, documentation or restructuring | [authoring-directus-extensions](../.agents/skills/authoring-directus-extensions/SKILL.md), [cookbook](extension-cookbook/index.md)                                                  |
| Production-readiness or pre-publish review                               | [auditing-directus-extensions](../.agents/skills/auditing-directus-extensions/SKILL.md), [cookbook](extension-cookbook/index.md)                                                    |
| Public extension behavior or consumer documentation                      | Package README, matching `skills/<name>/SKILL.md`, [documentation and skills](extension-cookbook/documentation-and-skills.md)                                                       |
| Work changing, documenting or relying on `extension-utils`               | [Extension-utils](extension-cookbook/extension-utils.md), [guards](extension-cookbook/guards.md) and affected focused articles                                                      |
| Directus APIs, loading, services, permissions or sandboxing              | [Official Directus documentation](extension-cookbook/official-directus-documentation.md) and MCP; [sandbox decision](decisions/do-not-sandbox-directus-extensions.md) when relevant |
| TypeScript code, configuration or convention decisions                   | [TypeScript conventions across phases](#typescript-conventions-across-phases), [workspace](workspace.md), relevant [local patterns](extension-cookbook/patterns-and-conventions.md) |
| Architectural decisions                                                  | [Decision index](decisions/index.md) and applicable records                                                                                                                         |
| Agent instructions or skills                                             | [writing-for-agents](../.agents/skills/writing-for-agents/SKILL.md)                                                                                                                 |

Multiple routes can apply. Read the applicable articles completely and follow their focused routes.
Select additional installed skills when relevant; skills guide the work within repository contracts
and the user's scope.

## 2. Implement

Apply `implement-simply` to the planned change. Update the owning implementation and affected
callers, exports, configuration and documentation together. Reconcile the impact decisions from
planning using the routed contracts; use selected checks while iterating when useful.

Implementation is complete when the requested result reaches every affected path and each changed
part serves that result. For read-only tasks, this phase produces the assessment and its evidence.

## 3. Review

For every review, read the [cookbook index](extension-cookbook/index.md), the
[extension-utils guide](extension-cookbook/extension-utils.md) and their task-relevant subpages.
Check the change against those contracts and identify existing utilities or patterns it should
reuse.

Apply `review-code-bloat`, then `review-code-hygiene`, then `review-test-value` to the complete
task-authored diff or named assessment target. Keep these passes read-only and use their evidence
checks and finding formats. Also review correctness and affected contracts; the three skills do not
replace that review.

Collect findings before cleanup, grouping shared causes rather than reporting them repeatedly.
Complete the phase when each pass has evidence-backed findings or a brief no-material-findings
conclusion. Keep working notes for resolved findings; no separate report is required.

## 4. Cleanup and verify

Use `clean-code` to recheck findings against current files and apply justified changes within the
authorized scope. Update affected callers, tests and docs together, revisiting the relevant review
pass when cleanup changes its evidence. Read-only tasks retain recommendations instead of edits.

Run the selected checks under
[verification selection](testing.md#selecting-verification-for-a-change). Resolve failures
introduced by the work and report existing failures or blocked checks separately. Broaden
verification only for a concrete remaining risk or failure; required CI and release gates remain in
force.

Inspect `git status --short`, `git diff --check -- <task-paths>` and the task's complete diff,
including untracked files. Compare against the starting state where files already contained edits.
Finish this phase when every task-authored edit belongs to the request, impact decisions are
reconciled, and material findings are resolved or explicitly deferred with a reason.

## 5. Required handoff

Lead with the result or read-only verdict and why it addresses the request. Scale detail to the task
and include:

- Concrete changes or findings, including material review and cleanup outcomes.
- Checks actually run, with exact commands and results. Distinguish existing failures, blocked
  relevant checks and material verification gaps.
- Material contract and documentation impact, unresolved findings, risks or required follow-up, with
  a concrete reason for any deferral.

Omit empty sections and routine no-impact declarations. Fixed headings, a separate report and a
proposed commit message are unnecessary for an ordinary task. Follow `AGENTS.md` for delivery
authorization.
