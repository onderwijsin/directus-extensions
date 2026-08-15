# Contributing

Contributions should improve a Directus extension, supporting package, repository contract, or
release workflow. Start with `AGENTS.md`, this workflow, and the relevant cookbook article.

Keep changes focused. Inspect nearby code before introducing a pattern, preserve unrelated work, and
make compatibility implications explicit. Public extension behavior requires synchronized package
README and consumer skill documentation. Public package concerns require a scoped Changeset.

Do not migrate legacy extensions as part of scaffolding. Extensions are developed against the shared
local Directus instance rather than separate per-extension environments.
