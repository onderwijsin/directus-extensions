---
name: loops-core-utils
description:
  Use @onderwijsin/loops-core as a framework-neutral utility package for parsing LMX, validating
  ASTs and webhooks, rendering safely, resolving variables and URLs, and evaluating conditional
  rules.
---

# Loops Core Utilities

Use this skill only to consume `@onderwijsin/loops-core`. Treat the package as a framework-neutral
utility library; do not infer permission to modify its source, tests, fixtures, CI, release setup,
or package API.

## Choose an integration

| Need                                            | Read                                               | Use                                                          |
| ----------------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------ |
| Parse/store LMX or optionally expand components | [references/api.md](references/api.md)             | `parseLoopsLmx`                                              |
| Build a safe renderer                           | [references/rendering.md](references/rendering.md) | AST types, rendering helpers, variables, URLs, inline styles |
| Render conditional Sections                     | [references/api.md](references/api.md)             | `evaluate`                                                   |
| Receive Loops webhooks                          | [references/api.md](references/api.md)             | verification and webhook schemas                             |

## Consumer workflow

1. Install the package: `pnpm add @onderwijsin/loops-core`.
2. Keep HTTP extraction, authentication, persistence, idempotency, queues, campaign policy, and
   presentation in the consumer application.
3. Keep signing secrets and Loops API keys server-side.
4. Use exported schemas at external boundaries; use `safeParse` where an invalid payload should
   become an application error response.
5. Render only the supported subset, escape text, resolve variables before presentation, evaluate
   conditional Sections with `evaluate`, and validate every destination URL.
6. Use `applyInlineStyles` for documented presentation attributes when the consuming framework needs
   inline styles; keep its `enabled` flag controlled by the renderer rather than persisted AST data.
7. LMX ordered and unordered lists may nest inside list items through 12 list levels; deeper lists
   remain recoverable but produce an `invalid_structure` diagnostic.

## Boundaries and safety

- Verify the exact raw webhook body before parsing JSON.
- Call component-expanding `parseLoopsLmx` with `apiKey` only from trusted server code. Omit it to
  guarantee parsing performs no network I/O.
- Component expansion is the package's only opt-in transport exception; there is no exported Loops
  client.
- Do not render LMX through `v-html`, `innerHTML`, or an equivalent raw HTML API.
- Treat unsupported nodes as omitted presentation data, not as a parsing failure.
- Treat missing variables and invalid conditional rules as presentation decisions controlled by
  `evaluate` fallbacks; the evaluator never throws.
- Treat `applyInlineStyles` output as the only supported inline-style mapping; never pass arbitrary
  `Style` metadata or unknown attributes to a style binding.
- Do not use `Style` metadata as untrusted CSS.

For framework-specific implementation, adapt these outputs to that framework rather than importing
the framework into the package. Use the official Loops SDK alongside this package when API client or
campaign functionality is needed.
