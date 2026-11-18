---
name: clean-code
description: Apply review findings or clean up a named code area through small justified changes and proportionate verification. Use for requested refactoring, simplification or cleanup; preserve supported behavior unless its change is explicitly in scope.
license: "MIT AND Apache-2.0"
metadata:
  agents: []
---

# Clean code

Execute the requested improvements with a focused, understandable diff. Start from existing
findings or a direct cleanup request; a fresh audit and extra approval are unnecessary when
the current request already authorizes the work.

## 1. Bind the target and behavior

Read the current request, applicable repository instructions, working-tree state, relevant
code, configuration and conventions. Preserve pre-existing edits. Resolve findings to their
current locations and recheck their evidence: an old report is a lead, not current proof.
For direct cleanup, identify the concrete maintenance problem in the named area. If no target
can be inferred from the current task, ask for one rather than expanding to the repository.
For cleanup of a PR or working-tree change, state its intended outcome in one sentence and
limit edits to changed code plus the dependent updates needed to simplify it. A named module
request can authorize a broader target; surrounding code is not automatically part of a diff cleanup.

Distinguish each proposed change:

- **Preserving behavior:** rename, extract, move, inline or simplify an equivalent flow.
- **Removing proven redundant/unreachable code:** establish the invariant or lack of a
  supported path, including exports, framework discovery, registrations and relevant history.
- **Changing supported behavior:** retire a feature, input, error outcome, public format or
  compatibility promise only when the current request includes that change.
  An explicit current requirement can supersede a historical test expectation; an inferred
  preference cannot authorize that change.
- **Unresolved:** preserve the uncertain part, state the missing evidence and continue with
  independent justified work. Ask only when that fact blocks a required decision.

For every retained item, identify the useful result and affected callers, tests, configuration
and documentation. A reviewer's confidence label does not replace its evidence. This step is
complete when the edits are authorized, their intended behavior impact is clear and uncertain
parts are separated from executable work.

## 2. Establish proportionate verification

Find the repository's actual commands and the existing checks relevant to the target. Run
a useful baseline when it distinguishes existing failures from regressions. Understand which
behaviors the checks exercise; a green suite alone is not proof of equivalence.

Test primarily the intended workflow, meaningful behavioral contracts and concrete risks.
Keep rejection and failure cases that protect supported contracts or concrete risks, rather
than preserving implementation history or enumerating theoretical input misuse.

Prefer improving existing tests over redundant cases, excessive parameterization or
implementation-specific assertions. Add a permanent test only for a concrete protection gap
with independently justified expectations. A bug fix does not automatically require a permanent
regression test, especially before the first release.

Use the narrowest meaningful evidence for the transformation: types and caller searches for
a rename, focused behavior cases for control flow, or existing format examples for reader
changes. Use real integration or E2E tests where mocks cannot establish the actual runtime
contract. Aim for the smallest maintainable suite that provides sufficient confidence;
coverage and test count are not goals in themselves. Characterization can establish unchanged
output with lower confidence in its correctness; identify that limit.

For behavior that cannot be checked adequately, narrow or defer the risky transformation
and proceed with safe independent items. Complete this step when each intended change has
a practical verification path or a clearly bounded reason to defer it.

## 3. Apply small transformations

Use a short sequence of named changes such as rename, inline, extract or move. Each change
must resolve a finding or a concrete problem in the request. Preserve useful abstractions,
cohesive logic and domain names; choose clarity over line reduction. Add a boundary when
responsibilities have a real reason to change separately, rather than imposing a design pattern.

Use **ablation** to compare simpler forms: omit an option, inline a wrapper, merge a layer or
derive a duplicated value, then identify the supported behavior or useful clarity at risk.
When a safe local experiment helps resolve the question, try one reversible cut and compare
the relevant behavior with the baseline. Keep it only when checks or an explicit invariant
establish preservation; a green check that misses the affected behavior is insufficient.
If a cut fails, diagnose the contract or test coupling and restore unsafe changes. The failure
alone does not prove the original abstraction necessary; another simpler form may preserve it.

Consolidate paths around their shared rule while preserving supported exceptions, error
outcomes and side-effect ordering. Remove incidental hardcoding only when a current contract
establishes the broader rule; cleanup does not authorize inventing new supported cases.

Update affected callers, imports, exports, registrations and configuration as part of the
same coherent change. Remove obsolete private support only after checking surviving users.
Keep runtime validation, error translation, cleanup, security and externally observable
behavior intact when moving logic. A type annotation does not establish runtime validation
of external or persisted data.

When touching persistence or public formats, inspect all relevant readers and supported
pre-change examples. A round trip through the edited writer and reader can hide a shared
regression. Supported error and compatibility behavior remains part of the contract even
when its only clear record is a test.

Keep comments and affected documentation accurate. Preserve explanations of non-obvious
constraints; remove misleading restatements. Small comment and JSDoc corrections stay with
the cleanup. Broader documentation deliverables follow the user's separately requested scope.

Check each meaningful group with its relevant checks. If it fails, diagnose and repair or
undo only your own transformation while preserving existing work. Keep the last verified
state recoverable. Broaden investigation when an identified failure or dependency requires
it; avoid adjacent cosmetic changes and speculative layers.

Test cleanup preserves distinct failure protection. Consolidate genuinely equivalent evidence
and remove fixture support only when it has no surviving consumer. Removing a redundant test
does not authorize removing the production behavior it exercised.

This step is complete when every in-scope item is applied or explicitly deferred, all affected
code is updated, and checks for the applied groups pass or have accurately reported limits.

## 4. Verify and hand off

Review the complete diff against the request and account for each remaining mechanism's
purpose. Explain non-obvious decisions to retain code when they matter to the result.
Recheck callers and contracts. Run
required repository checks and any focused checks for remaining concrete risks. Re-run checks
after fixes as needed; a full suite after every tiny edit is unnecessary unless repository
guidance or the change's risk requires it. Inspect unexpected collection drops, skips and
generated files when tests or tooling changed.

Resolve failures introduced by the cleanup. Report the improvements and why they help,
behavior impact, exact checks run and results, and deferred items with missing evidence.
Report pre-existing failures and verification gaps separately. No change needed is a valid
outcome when the target is already clear or the evidence does not justify an edit.

Modified adaptation of Sentry's code-simplifier (based on Anthropic's code-simplifier agent)
and Han's refactor skill. For changes, attribution and terms, see [source notices](NOTICES.md).
