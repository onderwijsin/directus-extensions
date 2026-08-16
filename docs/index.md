# Repository documentation

This directory contains the maintainer contract for the Directus extensions monorepo. Start with the
article that matches the work, then follow its linked source-of-truth documents completely.

## Start here

| Task                                                                             | Read                                                                                                                                       |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Any code, test, package, or documentation change                                 | [`agent-workflow.md`](agent-workflow.md), then the relevant row below                                                                      |
| Create or restructure an extension or shared package                             | [`extension-cookbook/index.md`](extension-cookbook/index.md), [`workspace.md`](workspace.md)                                               |
| Change Directus behavior, services, permissions, hooks, endpoints, or sandboxing | [`extension-cookbook/official-directus-documentation.md`](extension-cookbook/official-directus-documentation.md) and the Directus docs MCP |
| Change tests or E2E behavior                                                     | [`testing.md`](testing.md), [`docker.md`](docker.md), and the relevant cookbook article                                                    |
| Change CI, Actions, scripts, or validation                                       | [`ci.md`](ci.md), [`actions.md`](actions.md), [`workspace.md`](workspace.md)                                                               |
| Change publishing, metadata, or release automation                               | [`publishing.md`](publishing.md), [`workspace.md`](workspace.md)                                                                           |
| Change local services, Compose, environment, or secrets                          | [`docker.md`](docker.md), [`environment.md`](environment.md), [`security.md`](security.md)                                                 |
| Record or revisit an architectural decision                                      | [`decisions/index.md`](decisions/index.md)                                                                                                 |
| Change public extension behavior                                                 | The package README and matching [`skills/`](../skills/) consumer skill                                                                     |

## Documentation layers

- **Repository contract:** workflow, workspace, CI, security, testing, environment, and publishing
  articles define how maintainers work.
- **Extension cookbook:** reusable Directus extension patterns and shared-package contracts.
- **Decision records:** accepted choices that constrain implementation until explicitly revisited.
- **Consumer documentation:** package READMEs and installable skills describe public behavior for
  operators and developers.
- **Official references:** Directus-specific facts must be checked against the official Directus
  documentation and MCP rather than inferred from local code.

If implementation and documentation disagree, verify the implementation, decide which source is
authoritative, and reconcile both in the same change. Use `pnpm validate:docs` for the automated
consumer-documentation coverage check.
