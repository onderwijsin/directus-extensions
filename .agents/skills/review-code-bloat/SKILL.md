---
name: review-code-bloat
description: Review unnecessary code, speculative flexibility, redundant layers, dependencies and verification machinery in a named area or change. Use for bloat or overengineering audits; return evidence-backed findings without edits.
license: MIT
metadata:
  agents: []
---

# Review code bloat

Determine whether each suspect capability earns its maintenance cost. Treat smells as leads;
one caller, one implementation, a wrapper or a catch block is not a finding by itself.
Review is read-only: return recommendations and preserve repository-owned content. Use
no-write check options or temporary outputs; disclose incidental artifacts if a tool leaves any.

## 1. Bind the scope

Read the request, applicable repository instructions, working-tree state, and relevant code,
configuration and contracts. Review the named area or change, including local additions when
they are in scope. For a branch review, establish the actual comparison base rather than
assuming a branch name. Follow only the callers, registrations and contracts needed to judge it.
If the target cannot be inferred from the current task, ask for it.
For a change review, summarize its intended outcome in one sentence and account for the
mechanisms it introduces: helpers, options, branches, state, types, dependencies and support code.

Judge behavior against explicit current requirements, which can supersede historical test
expectations. An inferred preference cannot retire a supported contract. This step is
complete when the review target, supported behavior and relevant entry points are identified,
or their gaps named.

## 2. Investigate necessity

Use **ablation** as a read-only question: if this piece were removed, inlined or merged, what
concrete behavior or useful clarity would be lost? Trace its purpose to a current requirement,
real consumer, public contract, operational workflow or independently meaningful invariant.
Inspect imports and callers,
framework discovery, hooks, registrations, public exports, active configuration and relevant
history before calling code dead. Public consumers can live outside the repository.
An unsuccessful search leaves uncertainty; it does not establish unreachability.

Look for:

- Unused behavior, flags or extension points with no supported consumer.
- Layers, conversions and wrappers that add navigation without policy or a useful boundary.
- Duplicate implementations that could reuse an identified helper, installed library or
  platform capability with equivalent semantics. Check installed versions and official docs.
- Repeated validation or fallback paths that add no distinct failure protection.
- State, flags or caches that duplicate derivable data, or type shapes that repeat the same
  authoritative knowledge without a separate contract.
- Verification machinery whose producer and checker share the same information and can fail
  together, without an independent consumer, authority or failure boundary.

Before judging deletion across dynamic discovery, trust, compatibility or persistence
boundaries, or comparing derived state and repeated type shapes, read
[evidence checks](references/evidence-checks.md).

A green check supports a cut only where it exercises the behavior at risk; otherwise identify
the invariant or missing evidence explicitly. A failing check can reveal a real contract or
an implementation-coupled test; it does not by itself prove the current structure necessary.

Trace production code and its supporting tests outward together when they justify only each
other. A closed justification loop requires evidence about the cluster's purpose; missing
documentation alone is insufficient. A test can be the clearest specification of a supported
error or compatibility contract. Test redundancy alone never justifies removing that behavior.
Test support earns its place through the intended workflow, meaningful contracts and concrete
risks; theoretical misuse and implementation history alone do not establish a present purpose.

Retain boundary validation, supported failure handling and compatibility unless affirmative
evidence establishes redundancy or retirement. A validated value can be checked again for a
different invariant, after mutation, or through an independent entry point. A rare input remains
supported until the contract says otherwise.

This pass is complete when each candidate has a supported purpose, a concrete redundancy or
unreachability argument, or an explicit evidence gap.

## 3. Report justified cuts

For each material finding, provide a compact record:

- **Location and issue:** the code and the unnecessary capability or concept.
- **Evidence and cost:** the caller, contract or invariant and the burden it establishes.
- **Smallest remedy:** what to remove or reuse, including affected support code.
- **Behavior impact:** preserving behavior, removing proven redundant/unreachable code,
  changing supported behavior, or unresolved.
- **Confidence and verification:** what is established, what is missing, and any focused
  check needed to resolve the risk. Keep confidence separate from importance.

Combine fields into a few sentences for small findings. Group a self-supporting cluster as
one issue; rank by practical benefit and risk. Recommend supported-behavior changes only as
such, with their required scope decision explicit. Leave uncertain candidates unapproved for
deletion and name the missing fact.

Own necessity findings here. Confusing structure in necessary code belongs to hygiene review;
weak test evidence belongs to test-value review. Cross-reference existing findings rather
than reporting their root cause again. These other reviews are optional, not prerequisites.

Finish with the inspected scope and material findings, or **No material findings** with a
brief basis and any important limitation. Finding counts and lines saved are not targets.

For adaptation history and license terms, see [source notices](NOTICES.md).
