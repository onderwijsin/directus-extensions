---
name: review-test-value
description: Review tests, fixtures and mocks for meaningful regression protection. Use when assessing tests added by an agent, tautological assertions, duplicate coverage, fragile tests or test-suite value; recommend keep, improve, consolidate or remove without edits.
license: MIT
metadata:
  agents: []
---

# Review test value

Test primarily the intended workflow, not every possible misuse of its input. Judge tests by
the meaningful behavioral contracts and concrete risks they protect, rather than implementation
history or theoretical edge cases. The goal is the smallest maintainable suite that provides
sufficient confidence, not maximum coverage or the fewest possible tests.

Return a read-only review of the requested tests and support code. Preserve repository-owned
content; run tools with no-write options or temporary outputs and disclose incidental artifacts.

## 1. Resolve the test scope

Read the request, applicable repository instructions, working-tree state, runner configuration
and tests in scope. For a change review, establish the comparison base or exact authored
files; include relevant local changes. Ask if the requested target cannot be resolved.
Inspect the production behavior and callers reached by those tests, and neighboring coverage
only where needed to assess overlap. Keep the review bounded by the request.

Check that the runner discovers the tests. Inspect fixtures, fakes, mocks, skips, deselections
and generated inputs that affect what executes. Run a focused collection or test command
when it resolves uncertainty safely; report execution limits. This step is complete when
the relevant test cases and their actual production path, or a gap in that path, are identified.

## 2. Trace the evidence

Use explicit current requirements to judge expectations. A changed requirement can supersede
a historical test expectation; an inferred preference cannot. Assess intended-workflow coverage
first, then rejection and failure cases justified by a supported contract or concrete risk.

For each case or genuinely equivalent group, establish:

1. The supported behavior or invariant and plausible regression it protects.
2. The production path exercised and observable result asserted.
3. The **oracle**: where the expected result came from independently of the implementation.
4. Whether that regression would make this assertion fail.
5. What distinct protection remains compared with other tests, and which harmless refactors
   would break it.

A requirement, protocol example, known result, still-relevant historical regression or independently
derived invariant can supply an oracle. An expected value obtained by calling the subject again,
copying its algorithm or repeating mock setup may share the very error being tested.
An intentionally recorded characterization test can protect against behavior changes while
providing weaker evidence of correctness; name that distinction.

For tautologies, heavy mocking, snapshots, duplicate cases or fixture problems, consult the
[test patterns](references/test-patterns.md) for contrasts to preserve.

Treat mocks, snapshots and short tests as techniques. An outbound payload, transaction order,
retry limit or exact error can be the contract. Public integration coverage does not
automatically replace a low-level numerical example or a distinct failure case.
Where mocks cannot establish the actual runtime contract, recommend a real integration or E2E
test exercising that boundary. Mocked success alone does not prove runtime wiring or compatibility.

Check apparent duplicates against the same contract, meaningful input class, production path,
observable result and failure mode. Keep distinct rejection, safety, persistence, concurrency,
compatibility and resource behavior. Similar output alone does not establish redundancy.

Ask what plausible regression would become undetected if a candidate test were removed.
Passing the remaining suite cannot answer that question by itself. If a structural cleanup
breaks a test, check its expectation against the supported contract before recommending a
rewrite: it may expose a behavior regression or merely depend on the old implementation.

Complete this pass when each in-scope case or equivalent group has an evidence-based value
decision or a named uncertainty. Working notes suffice; no permanent evidence map is required.

## 3. Recommend the smallest useful change

Use **keep**, **improve**, **consolidate** or **remove**. A useful suite can receive a short
overall keep assessment rather than one report entry per test. For material findings, include:

- **Location and issue:** the case or support cluster and its value problem.
- **Evidence and cost:** the asserted result, oracle and failure it misses or duplicates.
- **Smallest remedy:** the recommendation; identify surviving evidence when consolidating.
- **Behavior impact:** preserving behavior, removing proven redundant/unreachable code,
  changing supported behavior, or unresolved. Test-only removal preserves production
  behavior but can reduce regression protection; state any protection lost.
- **Confidence and verification:** what is established, what needs checking, and any focused
  collection or execution check needed. Confidence is separate from importance.

Group issues with the same cause and rank by practical benefit and risk. Prefer improving
existing tests over redundant new cases, excessive parameterization or implementation-specific
assertions. Recommend a new permanent test only for a concrete protection gap, with a meaningful
observation and independent oracle. A bug fix does not automatically warrant a permanent
regression test, especially before the first release. Fixture cleanup follows surviving
consumers. A coverage target or missing helper test alone does not establish a protection gap.

Production behavior requires a separate necessity argument before removal. When production
machinery and tests justify only one another, supply evidence to one combined bloat finding;
a test specifying a supported error is not such a loop merely because it is the only record.
Leave unresolved candidates intact in the recommendation and identify the missing evidence.

Finish with the inspected scope, material recommendations and checks actually run, or
**No material findings** with a brief basis.

For adaptation history and license terms, see [source notices](NOTICES.md).
