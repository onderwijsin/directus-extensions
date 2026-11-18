# Sources and notices

Modified adaptations by Stichting Onderwijs in, 14 November 2026, including
`references/test-patterns.md`.

[deslop, MrZoyo](https://github.com/MrZoyo/deslop-GPT/blob/3913d8afeb18ed5c3cabc3ec39202ce02587ca87/skills/deslop/SKILL.md),
its [test smells](https://github.com/MrZoyo/deslop-GPT/blob/3913d8afeb18ed5c3cabc3ec39202ce02587ca87/skills/deslop/references/test-smells.md)
and [reachability reference](https://github.com/MrZoyo/deslop-GPT/blob/3913d8afeb18ed5c3cabc3ec39202ce02587ca87/skills/deslop/references/evidence-and-reachability.md)
supply oracle tracing, distinct failure protection, dominance checks, fixture retirement
and preservation of production contracts. Copyright (c) 2026 MrZoyo; MIT.
Full notice: [LICENSE-DESLOP](LICENSE-DESLOP).

Converted test-first cleanup into an independently usable read-only reviewer. Replaced
mandatory integration roots and collection accounting with checks triggered by a concrete
risk. Keep, improve, consolidate and remove are recommendations, and a useful suite can
receive an overall keep assessment.

## Additional adapted source

[antfu-simplify, Anthony Fu](https://github.com/antfu/skills/blob/d524ed287eef22757297827ce42e3cad88abd20c/skills/antfu-simplify/SKILL.md),
revision `d524ed287eef22757297827ce42e3cad88abd20c`, skill version `2026.10.31`.
Copyright (c) 2025-PRESENT Anthony Fu; MIT. Full notice: [LICENSE-ANTFU](LICENSE-ANTFU).

Adapted the question of what protection test removal loses. Passing the remaining suite
is not evidence that a removed test was redundant; failures after structural cleanup require
checking the behavioral contract before rewriting assertions. The maintainer's workflow-first
testing policy remains authoritative.

## Examined without copying

[remove-tautological-tests, brandhaug](https://github.com/brandhaug/skills/blob/9cb193614af39847d80ab687ef3a8de01841632e/remove-tautological-tests/SKILL.md)
was compared for oracle, interaction and refactor-fragility reasoning. No license declaration,
license file or copyright notice was found in its skill, README or complete repository tree
at this revision. Its wording and examples are not reproduced or adapted. The overlapping
patterns here come from the MIT-licensed deslop sources.

The local contribution is MIT: [LICENSE-MIT](LICENSE-MIT).
