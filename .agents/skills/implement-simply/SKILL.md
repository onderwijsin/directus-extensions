---
name: implement-simply
description: Implement features and fixes with the simplest sufficient design. Use when writing or changing production code, choosing an implementation approach, or deciding whether a dependency or abstraction is needed.
license: MIT
metadata:
  agents: []
---

# Implement simply

Deliver the complete requested outcome with the fewest necessary concepts. Prefer code a
maintainer can follow over a smaller line count. This skill guides implementation within
the current task; it requires no separate review or cleanup pass.

## 1. Establish the requirement

Read the request, applicable repository instructions, and the affected code and configuration.
Inspect the working tree and preserve existing work. Identify the required observable result,
supported inputs and failures, and the callers, exports, tests or documentation the change
must reach. Use the repository's actual stack and commands.
Summarize the intended outcome in one sentence and use it to judge each part of the change.

An explicit current requirement can supersede a historical test expectation. An inferred
preference cannot; establish the intended contract before changing an existing expectation.

Resolve routine choices from local conventions. State assumptions that affect the result;
ask when missing information changes scope, correctness or a consequential contract. Proceed
with independent work while that question remains open. This step is complete when the
required result and a practical way to check it are clear.

## 2. Choose the direct path

Look for a suitable existing implementation before creating one:

1. Reuse the project's helpers, components, shared modules and established patterns.
2. Check language, framework and platform capabilities, then installed dependencies.
3. Write focused local code when it is clearer than adapting a mismatched abstraction.
4. Add a dependency or shared layer only when its current benefit outweighs integration,
   maintenance and operational costs. Verify version-sensitive capabilities in official docs.

Keep the design sufficient for current requirements. Add options, extension points and
compatibility paths for an identified consumer or supported contract. An abstraction can
earn its place with one caller or implementation when it names domain knowledge, owns a
lifecycle, enforces a boundary or isolates a real reason to change.

Reuse or derive types for genuinely shared shapes, while keeping distinct domain or public
contracts independent. Derive values from existing authoritative data when separate state
would only duplicate it; retain snapshots or caches with a concrete lifecycle or performance role.

Choose the approach once each proposed layer or behavior has a present purpose. For a small
task, this can remain working reasoning; explain a trade-off only when it affects the user.

## 3. Make the complete change

Fix the cause at its owning boundary and update affected callers, configuration and exports.
Apply the governing rule to the supported input class instead of hardcoding an incidental
name, path or value from the bug report. Preserve genuine domain exceptions and keep the
solution within current requirements.
Keep cohesive logic together, names concrete, types informative and control flow readable.
Extract or inline when it improves understanding; use repository conventions to choose the form.
Remove support code your change makes unused within scope.

Preserve necessary validation, error handling, security, accessibility and observable behavior
when moving code. Establish an invariant from runtime control flow before treating a branch
as impossible. Type annotations alone do not validate external input, persisted data or
independently callable entry points. Catch failures where there is a defined recovery,
translation or cleanup responsibility; let unexpected failures remain visible.

Keep adjacent cleanup outside the change. Correct affected comments or documentation where
the implementation makes them misleading. Explain non-obvious constraints and decisions;
ordinary comments and small JSDoc corrections belong to this task. A separate documentation
workflow is appropriate when documentation itself is the requested deliverable.

Implementation is complete when all affected paths serve the requested result and each changed
part has a reason tied to it.

## 4. Verify the result

Use relevant existing checks and run required repository checks. Test primarily the intended
workflow and its meaningful behavioral contracts and concrete risks. Keep rejection and
failure cases when they enforce a supported contract or address a concrete risk; avoid
enumerating theoretical input misuse or preserving implementation history for its own sake.

Prefer improving existing tests over adding redundant cases, excessive parameterization or
implementation-specific assertions. Add a permanent test only for a concrete protection gap,
with an expected result derived from a requirement, known example or independent invariant.
For a bug fix, reproduce the failure when practical and confirm the fix resolves it. A fix
does not automatically require a permanent regression test, especially before the first release.

Use real integration or E2E tests where mocks cannot establish the actual runtime contract.
Choose the smallest meaningful check: types and callers may suffice for a rename; a parser
may need a specified rejection case; framework wiring may require exercising the real runtime.
Aim for the smallest maintainable suite that provides sufficient confidence. Coverage and
test count are not goals in themselves.

Review the full diff against the stated outcome. For each added mechanism, ask what required
behavior or useful clarity would be lost if it were omitted, inlined or merged; remove it when
the direct path is sufficient. Check for omitted callers and unrelated edits. Finish when
the requested result is checked and failures caused by the change are resolved. Report the
outcome, material decisions, checks actually run and remaining verification gaps concisely.
An already sufficient implementation can be the right result.

For adaptation history and license terms, see [source notices](NOTICES.md).
