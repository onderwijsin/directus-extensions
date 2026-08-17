# Decision: Defer Sentry runtime configuration to consumers

- **Status:** Accepted
- **Date:** 2026-08-17
- **Scope:** Sentry bundle, local Compose, repository E2E, and consumer Directus deployments

## Context

The Sentry bundle adds Directus-specific integration, but the Sentry Node SDK must be available in
the Directus process that loads the bundle. Node-side Sentry also needs to be initialized before
Directus starts through a consumer-provided `sentry-instrument.js`, normally loaded with
`NODE_OPTIONS`.

The repository's local and E2E environments use the regular Directus image. They do not provide a
consumer-specific Dockerfile or a general-purpose place to install and initialize Sentry for every
project. Enabling the bundle in those environments without those runtime prerequisites causes
Directus to fail while loading the bundle with errors such as `Cannot find module '@sentry/node'`.

## Decision

Keep Sentry disabled by default in both local Compose and repository E2E:

```env
SENTRY_ENABLED=false
```

Do not add Sentry runtime dependencies, a custom Dockerfile, or `sentry-instrument.js` to this
repository's shared local or E2E runtime.

Defer the deployment-specific part of Sentry configuration to each consumer. A consumer that wants
Sentry must provide all of the following in its own Directus runtime image or deployment:

1. Install compatible versions of `@sentry/node` and, when profiling is enabled,
   `@sentry/profiling-node`.
2. Provide and load `sentry-instrument.js` before Directus starts, for example with
   `NODE_OPTIONS="--import /directus/sentry-instrument.js"`.
3. Install the Sentry bundle and configure its Directus environment variables.
4. Set `SENTRY_ENABLED=true` only after the runtime prerequisites are present.

The bundle remains responsible for Directus-specific behavior: registering the Express error handler
when `SENTRY_DSN` exists and embedding the browser loader when `SENTRY_LOADER_SCRIPT` exists. It
does not own the Directus process-wide SDK initialization, consumer Docker image, Sentry project
configuration, secrets, sampling policy, or release policy.

## Rationale

- The local and E2E images remain representative of the repository's regular Directus runtime and do
  not hide deployment-specific image customization.
- A disabled bundle can be installed and built without requiring Sentry packages to be resolvable
  from the Directus runtime; the hook avoids loading `@sentry/node` while disabled.
- Consumers control their Directus base image, Node dependencies, Sentry project, secrets, profiling
  choice, sampling, instrumentation, and release strategy.
- CI E2E remains deterministic and does not send test events to an external Sentry project.
- The failure boundary is explicit: enabling Sentry without preparing the runtime is a consumer
  deployment error, rather than a hidden repository image or package-installation side effect.

## Alternatives considered

- **Add Sentry to the shared Directus image:** rejected because it would impose Sentry dependencies,
  configuration, and maintenance on every local and E2E run.
- **Provide a repository-wide Dockerfile and instrumentation file:** rejected because those files
  would encode one consumer's deployment choices and cannot safely represent every Sentry project,
  secret, profiling, or release setup.
- **Bundle or dynamically install the Node SDK:** rejected because extension loading does not own
  the Directus runtime dependency tree, and runtime installation would be unsafe and non-
  reproducible.
- **Enable Sentry only when a DSN is present:** rejected as the sole guard because a DSN does not
  prove that the runtime SDK and instrumentation are installed; the explicit master switch keeps
  local and CI behavior safe.

## Consequences

Consumers receive a safe, disabled-by-default integration, but enabling it requires deployment work
outside the published extension package. The extension README and consumer skill must document the
runtime dependency, Dockerfile, instrumentation, environment, and troubleshooting contract. Local
and E2E Compose files must retain the explicit `SENTRY_ENABLED=false` default.

## Reconsideration criteria

Revisit this decision if the repository adopts a supported custom Directus base image, a documented
organization-wide Sentry deployment contract, or a reproducible runtime mechanism that can provide
the SDK and instrumentation without imposing consumer-specific configuration on local and E2E users.
