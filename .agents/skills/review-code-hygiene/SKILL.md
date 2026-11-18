---
name: review-code-hygiene
description: Review readability and maintainability of necessary code in a named area or change. Use for cohesion, coupling, responsibility boundaries, naming, types, control flow, error ownership and code comments; report concrete maintenance problems without edits.
license: "MIT AND Apache-2.0"
metadata:
  agents: []
---

# Review code hygiene

Find structure that makes required behavior harder to understand or change. Read-only review:
return findings without editing repository-owned content. Run checks only with no-write
options or temporary outputs and disclose incidental artifacts. Judge maintenance impact
rather than conformance to a preferred coding style.

## 1. Understand the target

Read the request, applicable repository instructions, working-tree state, affected code and
nearby conventions. Resolve a named area or the current change; for a branch comparison,
establish the actual base. Ask when the target is genuinely ambiguous. Trace relevant callers,
types, configuration and error contracts far enough to understand the code's responsibilities.
Keep investigation bounded by the requested review.

Resolve conflicting expectations against explicit current requirements. A changed requirement
can supersede a historical test; an inferred style or cleanup preference cannot.

Complete this step when you can describe the required behavior, its owning modules and the
boundaries callers rely on. Record missing context as uncertainty.

## 2. Identify concrete maintenance costs

Inspect the necessary code for these problems:

- **Cohesion:** unrelated domain decisions, transformations, persistence or presentation
  change together unnecessarily. Explain which responsibilities have distinct reasons to change.
- **Coupling:** callers know another module's private representation, duplicate its policy,
  or must coordinate edits across layers to change one rule.
- **Names and types:** names obscure domain meaning; broad types, casts or flag combinations
  hide valid states or transfer avoidable reasoning to every caller. Repeated shapes can drift;
  deriving an independent public or domain type can instead create unwanted coupling.
- **Control flow:** nesting, dense expressions, scattered mutations or distant conditions
  obscure ordering, invariants or outcomes. Show which reasoning becomes easier with the remedy.
  Check whether duplicated state makes readers reconcile multiple sources of truth; retain
  intentional snapshots and caches with a concrete lifecycle or performance role.
- **Error ownership:** a failure is translated, recovered from or logged where its caller
  cannot act on it, or handling obscures the boundary responsible for the decision.
- **Comments and documentation:** text contradicts behavior or narrates syntax while a
  non-obvious constraint remains unexplained. Preserve reasons, trade-offs and useful invariants.

Use SOLID as a diagnostic vocabulary: identify a concrete change that currently spreads, a
contract that is violated, or knowledge that crosses an inappropriate boundary. A short
cohesive function may contain several operations; a useful abstraction may have one
implementation. Split or extract for clearer responsibility, domain meaning or lifecycle,
and inline when indirection hides those things. File count and function length are clues.
When consolidating similar paths, identify the shared domain rule and preserve meaningful
differences; similar syntax alone does not establish shared responsibility.

Prefer readable, explicit logic to clever compression. Existing consistent patterns can be
clearer than an isolated preferred style. Recommend a type or flow change only when it
clarifies valid states or behavior; preserve runtime validation at external boundaries.

For each candidate, identify the reader or maintainer task it makes harder and the smallest
change that helps. An example of a plausible edit is enough; a hypothetical future framework
is not. Finish this pass when the target's responsibility and flow issues have been assessed
and each retained finding has evidence and a maintenance consequence.

## 3. Report useful improvements

Each finding contains, in a few sentences where possible:

- **Location and issue:** the confusing code or documentation and the concrete problem.
- **Evidence and cost:** an affected caller, invariant or plausible maintenance task.
- **Smallest remedy:** the change that improves understanding or isolates responsibility.
- **Behavior impact:** preserving behavior, removing proven redundant/unreachable code,
  changing supported behavior, or unresolved.
- **Confidence and verification:** established facts, missing context and only the checks
  needed for the proposed change. Confidence is separate from practical importance.

Group findings with the same cause and rank material improvements by benefit and risk.
Suggested verification should exercise the intended workflow and the concrete risk in the
finding, using a real integration or E2E check when mocks cannot establish the runtime contract.
Leave formatting and routine style enforcement to repository tools. Ordinary comment or
JSDoc findings stay in this review; broader README, API or guide work follows a separately
requested documentation workflow.

Necessity belongs to bloat review and test evidence to test-value review. Cross-reference an
existing finding when they supply context for the same problem; running them is optional.
Return the inspected scope and findings, or **No material findings** with a brief basis and
important limitations. An already clear module needs no proposed refactor.

Modified adaptation of Sentry's code-simplifier, itself based on Anthropic's code-simplifier
agent. For attribution, changes and license terms, see [source notices](NOTICES.md).
