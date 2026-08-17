# Consumer documentation and skills

Read this article whenever installation, configuration, extension registration, public options,
exposed endpoints, hooks, operations, interfaces, displays, layouts, panels, modules, themes,
permissions, compatibility, requirements, errors, or other consumer-visible behavior could change.

Every published extension has a package `README.md`, `CHANGELOG.md`, and a consumer-facing
installable skill in `skills/<extension-name>/SKILL.md`.

Write the README and consumer skill for developers and operators installing or using the extension,
not extension maintainers. Explain purpose, installation, Directus integration, configuration,
public behavior, compatibility, important dependencies, required permissions or environment
configuration, and troubleshooting or boundaries where useful. Include concise, copyable examples
using the published package name and documented Directus configuration.

## Consumer skill completeness

The consumer skill is an operational reference, not a shorter README or a pointer to one. It must be
at least as complete as the extension README and should expand on it wherever consumers need
decision-making or deployment context. Before considering a consumer skill complete, cover all of
the following that apply:

- every configuration option, environment variable, Directus setting, default, required value,
  accepted value, and interaction with other options, preferably in a configuration table;
- the complete consumer-facing API surface, including exported functions, components, routes, hooks,
  operations, inputs, outputs, errors, events, and runtime behavior;
- plenty of copyable code examples for installation, the normal setup, each important integration
  path, and common customization or error-handling paths;
- prerequisites and context, including Directus version, runtime dependencies, permissions,
  collections, fields, roles, policies, sandbox or trust boundaries, deployment requirements,
  secrets, build steps, and compatibility constraints;
- operational guidance, including enabling and disabling behavior, startup order, lifecycle,
  production considerations, observability, security, troubleshooting, and known limitations; and
- a clear explanation of what the package does not provide or own, so consumers do not infer that an
  extension installs infrastructure, dependencies, configuration, or services outside its published
  contract.

Use the README as the minimum content baseline, then use the skill to provide the full task-oriented
reference an agent or operator needs. Keep both documents synchronized with implementation and
package metadata. When a detail is consumer-visible, document it in both places; when the skill adds
deployment recipes or troubleshooting context, ensure those recipes still agree with the README's
contract.

Adapt the documentation to the extension type. Describe the consumer-facing contract that actually
exists, such as:

- where and how the extension is installed or enabled;
- required Directus versions and compatibility constraints;
- environment variables or Directus configuration;
- exposed endpoint routes and request behavior;
- hook events and resulting behavior;
- Flow operation inputs, outputs, and errors;
- interfaces, displays, layouts, panels, modules, or themes exposed in the Data Studio;
- required collections, fields, permissions, roles, policies, or other project prerequisites; and
- relevant security, deployment, or operational boundaries.

Do not expose internal source paths, workspace-only utilities, build tooling, or implementation
details as consumer API. Consumer examples must use only the published extension package and its
documented Directus-facing contract. Explain Directus permissions, accountability, environment,
sandbox scopes, and Marketplace constraints when they affect use. Describe what consumers install,
configure, invoke, or interact with, not how the extension works internally.

Keep the README and skill aligned whenever installation, configuration, compatibility, requirements,
public behavior, or an extension's Directus-facing contract changes.

Use existing extension READMEs and skills as local writing patterns. For maintainer guidance, use
the repository's `authoring-directus-extensions` skill and this cookbook.

## Synchronization decision

Trace the implementation change through both consumer surfaces:

| Change                                                                                                          | README                                        | Consumer skill                                         |
| --------------------------------------------------------------------------------------------------------------- | --------------------------------------------- | ------------------------------------------------------ |
| Installation, extension loading, registration, or requirements                                                  | Update                                        | Update                                                 |
| Public option, configuration value, default, or disabled behavior                                               | Update                                        | Update                                                 |
| Endpoint, hook, operation, interface, display, layout, panel, module, theme, or other consumer-visible behavior | Update                                        | Update                                                 |
| Required collection, field, permission, role, policy, environment variable, or Directus configuration           | Update                                        | Update                                                 |
| Compatibility, dependency, security boundary, limitation, error, or troubleshooting behavior                    | Update                                        | Update when it affects installation or usage decisions |
| Internal refactor with identical consumer-visible behavior                                                      | No content change required; record the reason | No content change required; record the reason          |

The README and consumer skill have different audiences but must describe the same public contract.
Do not copy maintainer implementation details into either document merely to prove synchronization.
When no consumer document changes are needed, state the concrete no-impact reason in the handoff.
