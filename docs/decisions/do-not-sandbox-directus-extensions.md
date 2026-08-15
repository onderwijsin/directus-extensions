# Decision: Do not require sandbox compatibility for Directus extensions

- **Status:** Accepted
- **Date:** 2026-08-14
- **Scope:** Directus API extension runtime and Marketplace distribution

## Context

Directus sandboxed API extensions run with restricted runtime capabilities and requested permission
scopes. Our extensions primarily serve controlled projects and may need the normal Directus context,
services, Node.js APIs, or server-side environment access.

## Decision

Sandbox compatibility is not a repository-wide requirement. Extensions may use the normal Directus
extension runtime when it is the clearest and safest implementation. Individual extensions may still
choose sandbox compatibility when their requirements fit the sandbox and Marketplace distribution is
valuable.

## Alternatives considered

- Require sandbox compatibility everywhere: improves default Marketplace installability, but would
  constrain the current extension set and add avoidable implementation complexity.
- Ignore sandboxing entirely: rejected because an extension may still benefit from Marketplace
  distribution and should make that trade-off explicitly.

## Consequences

Non-sandboxed API extensions require a trusted Directus installation and may not be installable
where only sandboxed extensions are permitted. Package READMEs and consumer skills must document
this boundary whenever it affects installation or deployment.

## Reconsideration criteria

Revisit this decision for an individual extension when Marketplace distribution becomes a meaningful
requirement and the extension can operate within the documented sandbox restrictions.
