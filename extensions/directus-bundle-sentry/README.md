# `@onderwijsin/directus-bundle-sentry`

Sentry integration bundle for trusted Directus deployments. It provides a server hook that embeds
the browser loader and registers the Express error handler, plus an optional test endpoint and Data
Studio module for verifying the integration.

The bundle is disabled by default. Set `SENTRY_ENABLED=true` only after the Directus runtime has
been prepared with the Sentry Node dependencies and instrumentation described below.

## Installation

Install the bundle into a Directus project using the published package:

```sh
pnpm add @onderwijsin/directus-bundle-sentry
```

The bundle is non-sandboxed and must run in a trusted Directus installation. Installing the bundle
alone is not sufficient when Sentry is enabled: the Directus runtime must provide the optional peer
dependency `@sentry/node`. The optional peer dependency `@sentry/profiling-node` is only needed when
the consumer's instrumentation enables profiling.

## Runtime prerequisites

This repository intentionally does not provide a Dockerfile or a global `sentry-instrument.js`.
Those are deployment-owned responsibilities because the bundle cannot install packages into the
Directus runtime image.

Consumers using a custom Directus image can install the runtime dependencies and load an
instrumentation file with `NODE_OPTIONS`:

```dockerfile
FROM directus/directus:12.2.0

USER root
RUN corepack enable && pnpm add --dir /directus --save-exact \
  @sentry/node@10.69.0
COPY sentry-instrument.js /directus/sentry-instrument.js
ENV NODE_OPTIONS="--import /directus/sentry-instrument.js"
USER node
```

Example `sentry-instrument.js`:

```js
import * as Sentry from '@sentry/node'

if (process.env.SENTRY_DSN && process.env.SENTRY_DSN.trim() !== '') {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.DEPLOYMENT_ENV ?? 'development',
    tracesSampleRate: 0.1,
  })
}
```

If profiling is required, also install the optional peer dependency
`@sentry/profiling-node@10.69.0`, import `nodeProfilingIntegration` in the instrumentation file, and
configure the profiling sample rate there. The bundle does not initialize profiling itself.

The instrumentation file initializes the Node SDK for Directus itself. The bundle adds the
Directus-specific Express handler and browser embedding; it does not replace global runtime
instrumentation.

## Configuration

Set these Directus environment variables after the runtime prerequisites are available:

| Variable                | Required           | Description                                                  |
| ----------------------- | ------------------ | ------------------------------------------------------------ |
| `SENTRY_ENABLED`        | No                 | Enables the bundle. Defaults to `false`.                     |
| `SENTRY_DSN`            | For server errors  | DSN used to register the Express error handler.              |
| `SENTRY_LOADER_SCRIPT`  | For browser errors | Sentry loader script tag from Sentry.                        |
| `SENTRY_RELEASE_PREFIX` | No                 | Prefix for the generated browser release. Defaults to `dev`. |
| `SOURCE_COMMIT`         | No                 | Commit used in the generated release. Defaults to `unknown`. |
| `SENTRY_RELEASE`        | No                 | Explicit release override.                                   |
| `DEPLOYMENT_ENV`        | No                 | Deployment environment. Defaults to `development`.           |

The loader script must match Sentry's hosted format:

```html
<script
  src="https://js-de.sentry-cdn.com/0123456789abcdef0123456789abcdef.min.js"
  crossorigin="anonymous"
></script>
```

Whitespace and newlines between the tag attributes are accepted.

## Test integration

The test endpoint is disabled unless both `SENTRY_ENABLED=true` and
`SENTRY_TEST_SUITE_ENABLED=true`. The test module exposes a button that intentionally throws a
browser exception. Enable these only in a controlled development or test environment.

## Compatibility and boundaries

- Requires a trusted, non-sandboxed Directus runtime.
- Requires a Directus runtime image capable of loading the Sentry Node dependencies.
- The default local Compose and repository E2E environments keep `SENTRY_ENABLED=false`.
- Sentry organization, project, DSN, sampling, and deployment-image configuration remain consumer
  responsibilities.
