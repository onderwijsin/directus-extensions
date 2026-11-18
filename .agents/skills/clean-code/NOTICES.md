# Sources and notices

Modified adaptations by Stichting Onderwijs in, 14 November 2026.

- [Sentry code-simplifier](https://github.com/getsentry/skills/blob/e94f22214528d69899d09c627b3315ddc3544816/skills/code-simplifier/SKILL.md):
  clarity over compression, useful abstractions, behavior preservation and focused updates.
  Copyright 2025 Functional Software, Inc. dba Sentry; Apache-2.0.
  Full terms: [LICENSE-APACHE-2.0](LICENSE-APACHE-2.0).
- [Han refactor, Test Double](https://github.com/testdouble/han/blob/abba73a773528905a8f3d15956029394746e5c7f/han-coding/skills/refactor/SKILL.md)
  and its [refactoring discipline](https://github.com/testdouble/han/blob/abba73a773528905a8f3d15956029394746e5c7f/han-coding/skills/refactor/references/refactoring-discipline.md):
  named targets, rechecking findings, small justified transformations, behavior preservation
  and recoverable verification steps. Copyright 2026 Test Double, Inc.; MIT.
  Full notice: [LICENSE-HAN](LICENSE-HAN).

Sentry credits [Anthropic's code-simplifier agent](https://github.com/anthropics/claude-plugins-official/blob/main/plugins/code-simplifier/agents/code-simplifier.md).
Its [inspected revision](https://github.com/anthropics/claude-plugins-official/blob/b5b01ac4f889fec0c4c6bb89f27ca7c8574473f6/plugins/code-simplifier/agents/code-simplifier.md)
also carries an Apache-2.0 [plugin license](https://github.com/anthropics/claude-plugins-official/blob/b5b01ac4f889fec0c4c6bb89f27ca7c8574473f6/plugins/code-simplifier/LICENSE).
No separate NOTICE file was present in the inspected Sentry or Anthropic package roots.

Removed host-specific config, scripts, model/tool declarations, mandatory full-suite runs
after each edit and blanket stopping rules. Replaced them with proportionate baseline and
verification choices, preservation of existing edits and explicit deferral under uncertainty.
Added authorized removal of proven redundant/unreachable code and a separate scope decision
for changes to supported behavior.

## Additional adapted source

[antfu-simplify, Anthony Fu](https://github.com/antfu/skills/blob/d524ed287eef22757297827ce42e3cad88abd20c/skills/antfu-simplify/SKILL.md),
revision `d524ed287eef22757297827ce42e3cad88abd20c`, skill version `2026.10.31`.
Copyright (c) 2025-PRESENT Anthony Fu; MIT. Full notice: [LICENSE-ANTFU](LICENSE-ANTFU).

Adapted explicit diff scope, a stated outcome, small reversible ablation experiments, and
final accounting for remaining mechanisms. A passing check must cover the risk; a failing
cut does not prove the original design necessary. Generalization stays within current
contracts, and verification remains proportionate.

The local contribution is MIT: [LICENSE-MIT](LICENSE-MIT). The adapted package retains both
MIT and Apache-2.0 obligations; the combined expression is `MIT AND Apache-2.0`.
