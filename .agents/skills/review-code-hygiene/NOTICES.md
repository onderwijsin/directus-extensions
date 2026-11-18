# Sources and notices

Modified adaptation by Stichting Onderwijs in, 14 November 2026.

[Sentry code-simplifier](https://github.com/getsentry/skills/blob/e94f22214528d69899d09c627b3315ddc3544816/skills/code-simplifier/SKILL.md)
supplies the clarity, cohesion, naming, useful-abstraction and behavior-preservation principles.
Copyright 2025 Functional Software, Inc. dba Sentry. Apache License 2.0:
[LICENSE-APACHE-2.0](LICENSE-APACHE-2.0).

The Sentry source credits
[Anthropic's code-simplifier agent](https://github.com/anthropics/claude-plugins-official/blob/main/plugins/code-simplifier/agents/code-simplifier.md).
Its [inspected revision](https://github.com/anthropics/claude-plugins-official/blob/b5b01ac4f889fec0c4c6bb89f27ca7c8574473f6/plugins/code-simplifier/agents/code-simplifier.md)
and [plugin license](https://github.com/anthropics/claude-plugins-official/blob/b5b01ac4f889fec0c4c6bb89f27ca7c8574473f6/plugins/code-simplifier/LICENSE)
were also checked. Both upstream packages use Apache-2.0; no separate NOTICE file was present
in the inspected package roots.

Converted execution into detection and evidence-backed recommendations. Removed React,
function-style and Claude-specific prescriptions; added explicit maintenance consequences,
pragmatic responsibility boundaries, uncertainty and read-only behavior. The local adaptation
is distributed under Apache-2.0, including the upstream terms and attribution above.

## Additional adapted source

[antfu-simplify, Anthony Fu](https://github.com/antfu/skills/blob/d524ed287eef22757297827ce42e3cad88abd20c/skills/antfu-simplify/SKILL.md),
revision `d524ed287eef22757297827ce42e3cad88abd20c`, skill version `2026.10.31`.
Copyright (c) 2025-PRESENT Anthony Fu; MIT. Full notice: [LICENSE-ANTFU](LICENSE-ANTFU).

Adapted checks for duplicated state and drifting type shapes, with independent domain/public
contracts and meaningful path differences preserved. Caller counts, repetition counts and
lines saved remain clues rather than maintenance verdicts.

The adapted package also retains the MIT terms of antfu-simplify. Its combined license
expression is `MIT AND Apache-2.0`.
