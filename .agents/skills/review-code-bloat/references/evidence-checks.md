# Evidence checks for deletion candidates

## Reachability

Trace a supported input through registration or discovery to its observable result. Ordinary
imports miss convention-based routes, plugins, commands, scheduled jobs, reflection and hooks.
For example, a Nuxt route or a registered Directus hook can be live with no ordinary importer.
Read the relevant framework configuration and version's discovery contract before judging it.

Public exports, manual operator commands and published formats can have external consumers.
Look for support commitments and retirement evidence; local caller counts cannot close that
question. Record which paths were checked and what remains unknown.

## Validation and fallback

For a repeated check, identify the first runtime validation, every intervening transformation
or mutation, and every entry point that reaches the later check. A verified transformation
may rule a branch out; a TypeScript type alone cannot establish that external data was parsed.

For a catch or fallback, identify the actual failure, required response and supported selector.
Recovery, stable error translation, rollback, resource cleanup and explicit compatibility are
useful responsibilities. A broad catch that disguises an unexpected failure warrants a finding
only when its effect and replacement are established.

## Derived state and shared types

For stored flags or caches, identify the authoritative inputs and compare computing the
value on demand with storing it. Check mutation, event timing, reactive tracking, lifetime,
concurrency and performance before calling the state redundant. A snapshot may intentionally
represent an earlier moment; a cache may enforce a real latency or resource limit.

For repeated type shapes, determine whether they express the same knowledge or independent
domain, wire or public contracts. Reusing or deriving a canonical type can prevent drift;
deriving one independent contract from another can introduce unwanted coupling. Inference
is useful when it keeps meaning and API stability clear, not as a reason to erase useful types.

## Verification machinery

Ask what a checker knows independently and which failure it can expose. Recomputing a value
with the same algorithm and input may repeat the same mistake. Hashing local arguments and
immediately verifying that new hash may add no protection when nobody else consumes it.

Preserve checks serving an independent digest, protocol, trust authority, content identity,
persistence readback, corruption detector or operational consumer. One process can cross a
real failure boundary by publishing and reopening a file. Common authorship does not make
that check circular. A payload digest also need not validate associated metadata.

## Representations and compatibility

Removing an internal check does not authorize changing a public envelope, stored format,
error result or supported legacy input. Enumerate readers by field and format names as well
as imports. A writer and reader changed together can agree on the same regression; use an
existing or contract-specified input when assessing compatibility.

Retire a cluster only when its supporting code has no surviving consumer or contract. Keep
supported behavior even if its old fixture or implementation is obsolete. Distinguish a
proposed behavior change from a behavior-preserving simplification, and preserve uncertain
parts while reporting what would resolve them.
