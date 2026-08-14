# `test-utils`

`test-utils` is a private package for shared Vitest fixtures and Directus integration helpers. It is
never a runtime dependency of a published extension and must not appear in packed output.

Keep helpers close to the tests they support until repetition justifies promotion. Prefer fixtures
that exercise the public extension contract and the shared local Directus instance rather than
source-only mocks that can hide packaging or registration failures.
