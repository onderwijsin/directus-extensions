# Architecture decisions

Decision records capture accepted repository choices that are easy to lose in implementation detail.
They are binding for the feature they cover until explicitly revisited.

## Records

| Decision                                                                                                           | Status   | Scope                                                     |
| ------------------------------------------------------------------------------------------------------------------ | -------- | --------------------------------------------------------- |
| [Do not require sandbox compatibility](do-not-sandbox-directus-extensions.md)                                      | Accepted | Directus API extension runtime and Marketplace trade-offs |
| [Use packed artifacts for Directus E2E](packed-artifacts-for-directus-e2e.md)                                      | Accepted | CI release-surface validation                             |
| [Use ephemeral credentials for E2E](ephemeral-e2e-service-credentials.md)                                          | Accepted | E2E isolation and secret handling                         |
| [Use Node 24 for organization runtimes](node-24-runtime.md)                                                        | Accepted | Supported runtime for organization-owned instances        |
| [Defer Sentry runtime configuration to consumers](defer-sentry-runtime-configuration-to-consumers.md)              | Accepted | Sentry bundle and Directus runtime configuration          |
| [Magic-link architecture and security boundaries](magic-links-architecture-and-security-boundaries.md)             | Accepted | Passwordless authentication endpoints and token security  |
| [Provide a custom typed `defineHook`](custom-define-hook-types.md)                                                 | Accepted | Directus API hook typing and package runtime boundaries   |
| [Use async-local mutation source context](async-local-mutation-source.md)                                          | Accepted | Sluggernaut nested redirect-history mutations             |
| [Enforce concurrent Sluggernaut redirect integrity in the database](sluggernaut-database-integrity-constraints.md) | Accepted | Sluggernaut redirect uniqueness and consumer migrations   |
| [Use a custom image for Garage initialization](custom-garage-init-image.md)                                        | Accepted | Local and E2E Compose Garage initialization               |

## Create or revisit a decision

Create a record when a choice affects multiple packages, runtime boundaries, security, release
behavior, or future maintenance and cannot be explained adequately in an implementation comment. Use
[`template.md`](template.md), link the decision from the relevant cookbook or workflow article, and
update the index.

When revisiting a record, preserve the old rationale in git history, state the compatibility impact,
and update every affected implementation and consumer document in the same change.
