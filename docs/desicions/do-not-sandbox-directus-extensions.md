# Decision: Do not sandbox Directus extensions

- **Status:** Accepted
- **Date:** 2026-08-14

## Context

Directus supports sandboxed API extensions. Sandboxing improves isolation and makes extensions
suitable for installation through the Directus Marketplace under its default trust model.

However, sandboxing significantly restricts the APIs and runtime capabilities available to
extensions. In particular, extensions lose direct access to much of the normal Directus extension
context, Node.js APIs, Directus services, environment variables, and other server-side capabilities.

Adopting these restrictions would:

- reduce developer experience when building and maintaining our extensions;
- require additional abstractions or workarounds for otherwise straightforward Directus
  integrations;
- limit the kinds of extensions and features we can implement; and
- make existing and future extensions more complex primarily to satisfy a distribution mechanism we
  do not depend on.

Our Directus extensions are primarily developed for and consumed by our own projects. Marketplace
distribution is therefore a convenience rather than a core requirement.

## Decision

We will not require our Directus API extensions to be sandbox-compatible.

Extensions may use the normal Directus extension context, services, Node.js APIs, and other
server-side capabilities when these provide the clearest and most appropriate implementation.

We will prioritize, in order:

1. developer experience;
2. maintainability;
3. access to the full Directus extension API; and
4. flexibility in what our extensions can implement;

over compatibility with the default sandboxed Directus Marketplace installation model.

This is a repository-level default, not a prohibition. An individual extension may still choose
sandbox compatibility when its requirements fit the sandbox and Marketplace distribution is useful.

## Consequences

Our API extensions may not be installable through the Directus Marketplace on instances that only
permit sandboxed extensions.

This is an accepted trade-off because our primary consumer is ourselves and we control the Directus
environments in which these extensions are deployed.

Sandbox compatibility can be reconsidered for an individual extension if Marketplace distribution
becomes a meaningful requirement and the extension can operate within the sandbox without
significant compromises.
