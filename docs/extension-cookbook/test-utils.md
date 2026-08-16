# `test-utils`

`test-utils` is a private package for shared Vitest fixtures, Directus integration helpers, and
child-process test infrastructure. It is never a runtime dependency of a published extension and
must not appear in packed output.

Keep helpers close to the tests they support until repetition justifies promotion. Prefer fixtures
that exercise the public extension contract and the shared local Directus instance rather than
source-only mocks that can hide packaging or registration failures.

## Process workers

Use `createProcessWorker` when a test needs a real Node process boundary, for example to verify
filesystem lock ownership or concurrent marker writes. It uses newline-delimited JSON over stdin and
stdout. Keep the worker script and provider-specific protocol next to the integration test, and
promote only process lifecycle and transport behavior to `test-utils`.

Always terminate workers in test cleanup and give them explicit temporary directories. This keeps
future process integration suites isolated without coupling the private helper package to one
provider.
