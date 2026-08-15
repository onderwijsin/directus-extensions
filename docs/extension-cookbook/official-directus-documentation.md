# Official Directus documentation routing

Use official Directus documentation before making a Directus-specific decision, especially before
inventing a workaround. Fully use Directus's MCP documentation when available; otherwise use the
canonical pages below. Read the foundation material plus only the references relevant to the task.

A full index of all Directus documentation can be found at: https://directus.com/docs/llms.txt

The complete documentation is also available as a single LLM-oriented document:
https://directus.com/docs/llms-full.txt

## Extension foundations

Read these before making architectural decisions about a Directus extension:

- [Extensions overview](https://directus.com/docs/raw/guides/extensions/overview.md)
- [Extensions quickstart](https://directus.com/docs/raw/guides/extensions/quickstart.md)
- [Extension CLI](https://directus.com/docs/raw/guides/extensions/cli.md)

When the extension is distributed as part of a collection of extensions:

- [Bundling extensions](https://directus.com/docs/raw/guides/extensions/bundles.md)

When publishing or packaging an extension for public consumption:

- [Marketplace](https://directus.com/docs/raw/guides/extensions/marketplace.md)
- [Publishing extensions](https://directus.com/docs/raw/guides/extensions/marketplace/publishing.md)

## API extensions

Read the API extension overview plus the documentation for the extension type being implemented:

- [API extensions overview](https://directus.com/docs/raw/guides/extensions/api-extensions.md)
- [Event hooks](https://directus.com/docs/raw/guides/extensions/api-extensions/hooks.md)
- [API endpoints](https://directus.com/docs/raw/guides/extensions/api-extensions/endpoints.md)
- [Flow operations](https://directus.com/docs/raw/guides/extensions/api-extensions/operations.md)
- [Internal services](https://directus.com/docs/raw/guides/extensions/api-extensions/services.md)
- [Sandboxed extensions](https://directus.com/docs/raw/guides/extensions/api-extensions/sandbox.md)

Prefer Directus internal services over reimplementing Directus behavior when an appropriate service
exists. When using internal services, check the services documentation rather than assuming
constructor arguments, accountability behavior, schema handling, or transaction semantics.

For custom endpoints involving permissions:

- [Check permissions in a custom endpoint](https://directus.com/docs/raw/tutorials/extensions/check-permissions-in-a-custom-endpoint.md)

## App extensions

Read the app extension overview plus the documentation for the extension type being implemented:

- [App extensions overview](https://directus.com/docs/raw/guides/extensions/app-extensions.md)
- [Interfaces](https://directus.com/docs/raw/guides/extensions/app-extensions/interfaces.md)
- [Displays](https://directus.com/docs/raw/guides/extensions/app-extensions/displays.md)
- [Layouts](https://directus.com/docs/raw/guides/extensions/app-extensions/layouts.md)
- [Panels](https://directus.com/docs/raw/guides/extensions/app-extensions/panels.md)
- [Modules](https://directus.com/docs/raw/guides/extensions/app-extensions/modules.md)
- [Themes](https://directus.com/docs/raw/guides/extensions/app-extensions/themes.md)
- [UI library](https://directus.com/docs/raw/guides/extensions/app-extensions/ui-library.md)
- [Composables](https://directus.com/docs/raw/guides/extensions/app-extensions/composables.md)

When building interfaces that must work correctly with collaborative editing:

- [Collaborative editing: development and custom extensions](https://directus.com/docs/raw/guides/content/collaborative-editing/development.md)

## Directus APIs and data access

Use these when an extension reads, writes, filters, queries, or exposes Directus data:

- [Authentication](https://directus.com/docs/raw/guides/connect/authentication.md)
- [Filter rules](https://directus.com/docs/raw/guides/connect/filter-rules.md)
- [Query parameters](https://directus.com/docs/raw/guides/connect/query-parameters.md)
- [Relational data](https://directus.com/docs/raw/guides/connect/relations.md)
- [Errors](https://directus.com/docs/raw/guides/connect/errors.md)
- [Directus SDK](https://directus.com/docs/raw/guides/connect/sdk.md)

Do not invent Directus filter syntax, query semantics, pagination behavior, relation expansion, or
error shapes. Consult these references first.

## Data model

Use these when an extension depends on collection, field, interface, or relationship behavior:

- [Collections](https://directus.com/docs/raw/guides/data-model/collections.md)
- [Fields](https://directus.com/docs/raw/guides/data-model/fields.md)
- [Interfaces](https://directus.com/docs/raw/guides/data-model/interfaces.md)
- [Relationships](https://directus.com/docs/raw/guides/data-model/relationships.md)

## Directus configuration

Use these before introducing custom environment variables or assuming Directus runtime behavior:

- [Configuration overview](https://directus.com/docs/raw/configuration/intro.md)
- [General configuration](https://directus.com/docs/raw/configuration/general.md)
- [Extensions configuration](https://directus.com/docs/raw/configuration/extensions.md)
- [Security and limits](https://directus.com/docs/raw/configuration/security-limits.md)
- [Logging](https://directus.com/docs/raw/configuration/logging.md)

Read additional configuration references when the extension interacts with the corresponding
subsystem:

- [Auth and SSO](https://directus.com/docs/raw/configuration/auth-sso.md)
- [Cache](https://directus.com/docs/raw/configuration/cache.md)
- [Database](https://directus.com/docs/raw/configuration/database.md)
- [Email](https://directus.com/docs/raw/configuration/email.md)
- [Files](https://directus.com/docs/raw/configuration/files.md)
- [Flows](https://directus.com/docs/raw/configuration/flows.md)
- [Realtime](https://directus.com/docs/raw/configuration/realtime.md)
- [Synchronization](https://directus.com/docs/raw/configuration/synchronization.md)

## Flows

Use these when authoring flow operation extensions or integrating extension behavior with Directus
Flows:

- [Create a Flow](https://directus.com/docs/raw/getting-started/create-an-automation.md)
- [Flow operation extensions](https://directus.com/docs/raw/guides/extensions/api-extensions/operations.md)
- [Flows configuration](https://directus.com/docs/raw/configuration/flows.md)

## File handling

Use these when an extension uploads, reads, serves, transforms, or manages files:

- [Upload files](https://directus.com/docs/raw/guides/files/upload.md)
- [Download files](https://directus.com/docs/raw/guides/files/download.md)
- [Manage files](https://directus.com/docs/raw/guides/files/manage.md)
- [Access files](https://directus.com/docs/raw/guides/files/access.md)
- [Transform files](https://directus.com/docs/raw/guides/files/transform.md)
- [Files configuration](https://directus.com/docs/raw/configuration/files.md)

Prefer Directus file services and asset handling mechanisms over accessing configured storage
backends directly unless the task explicitly requires otherwise.

## Authentication and permissions

Use these whenever extension behavior depends on the current user, role, policy, permissions,
accountability, tokens, cookies, or authentication state:

- [Access tokens](https://directus.com/docs/raw/guides/auth/tokens-cookies.md)
- [Access control](https://directus.com/docs/raw/guides/auth/access-control.md)
- [Accountability](https://directus.com/docs/raw/guides/auth/accountability.md)
- [API authentication](https://directus.com/docs/raw/guides/connect/authentication.md)
- [Auth and SSO configuration](https://directus.com/docs/raw/configuration/auth-sso.md)
- [Security and limits](https://directus.com/docs/raw/configuration/security-limits.md)

Do not bypass Directus accountability or permissions merely because extension code executes on the
server. Determine explicitly whether an operation should run as the requesting user, with elevated
privileges, or without accountability, and use the documented Directus mechanism appropriate to that
behavior.

## Realtime and WebSockets

Use these when an extension interacts with realtime subscriptions or custom WebSocket behavior:

- [Realtime authentication](https://directus.com/docs/raw/guides/realtime/authentication.md)
- [Subscriptions](https://directus.com/docs/raw/guides/realtime/subscriptions.md)
- [Realtime actions](https://directus.com/docs/raw/guides/realtime/actions.md)
- [Custom WebSocket handlers](https://directus.com/docs/raw/guides/realtime/custom-handlers.md)
- [Realtime configuration](https://directus.com/docs/raw/configuration/realtime.md)

## Deployment and loading extensions

Use these when reasoning about how an extension is installed, loaded, deployed, or configured in a
self-hosted Directus instance:

- [Including extensions](https://directus.com/docs/raw/self-hosting/including-extensions.md)
- [Self-hosting requirements](https://directus.com/docs/raw/self-hosting/requirements.md)
- [Deploying Directus](https://directus.com/docs/raw/self-hosting/deploying.md)
- [Hardened images](https://directus.com/docs/raw/self-hosting/hardened-images.md)
- [Extensions configuration](https://directus.com/docs/raw/configuration/extensions.md)

For Directus Cloud:

- [Custom extensions](https://directus.com/docs/raw/cloud/configuration/custom-extensions.md)

## Version compatibility

Before relying on undocumented behavior, internal APIs, or behavior that may have changed between
Directus versions, check:

- [Releases](https://directus.com/docs/raw/releases.md)
- [Changelog](https://directus.com/docs/raw/releases/changelog.md)
- [Breaking changes](https://directus.com/docs/raw/releases/breaking-changes.md)
- [Directus 11 breaking changes](https://directus.com/docs/raw/releases/breaking-changes/version-11.md)
- [Directus 12 breaking changes](https://directus.com/docs/raw/releases/breaking-changes/version-12.md)

The documentation index describes the documentation as targeting the latest Directus version. When
the project targets a specific Directus version, do not assume the latest documentation exactly
matches that version; verify compatibility where behavior is version-sensitive.

## Extension examples and tutorials

Use tutorials as implementation examples after consulting the corresponding reference documentation.
Relevant extension tutorials are indexed here:

- [Extension tutorials](https://directus.com/docs/raw/tutorials/extensions.md)

Examples include custom endpoints, hooks, operations, panels, layouts, displays, modules,
permissions, external API integrations, error tracking, and search indexing.

Treat tutorials as examples rather than the authoritative definition of an API. Prefer the
extension, configuration, API, and data-model references above when they disagree or when exact
behavior matters.
