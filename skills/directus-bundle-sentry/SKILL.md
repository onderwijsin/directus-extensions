---
name: directus-bundle-sentry
description: Configure and deploy the Sentry bundle in a trusted Directus runtime.
---

# Directus Sentry bundle

`@onderwijsin/directus-bundle-sentry` provides Directus-specific Sentry wiring:

- a server hook that adds the Express error handler when a DSN is configured;
- a server hook that embeds the Sentry browser loader and initializes it with release and
  environment metadata;
- an optional endpoint that intentionally throws a server error; and
- an optional Data Studio module with a button that intentionally throws a browser error.

The bundle is non-sandboxed and must run in a trusted Directus installation. It is disabled by
default. Treat `SENTRY_ENABLED=true` as a deployment change, not as a package-installation step.

## Runtime boundary

Installing the bundle into Directus is not sufficient for server-side Sentry. The Directus runtime
must also contain the Node SDK packages, and Directus itself must load a consumer-owned
`sentry-instrument.js` through `NODE_OPTIONS`. This repository intentionally does not provide a
Dockerfile or global instrumentation file.

The instrumentation file initializes Sentry for the Directus process. The bundle then adds the
Directus-specific Express handler and browser embedding. Keep these responsibilities separate:

```text
consumer Docker image
  ├─ installs @sentry/node and optional @sentry/profiling-node
  ├─ copies sentry-instrument.js
  └─ sets NODE_OPTIONS=--import /directus/sentry-instrument.js

installed bundle
  ├─ registers the Express error handler when SENTRY_DSN exists
  └─ embeds the browser loader when SENTRY_LOADER_SCRIPT exists
```

## Installation

```sh
pnpm add @onderwijsin/directus-bundle-sentry
```

The bundle declares `@sentry/node` and `@sentry/profiling-node` as optional peer dependencies.
Directus resolves extension dependencies from the Directus runtime module tree, so install
`@sentry/node` into that runtime image when Sentry is enabled. Install `@sentry/profiling-node` only
when the consumer's instrumentation enables profiling.

## Consumer Dockerfile

The following is the minimal custom-image pattern. Pin the Directus and Sentry versions in the
consumer project and keep them aligned with the bundle's supported Node runtime:

```dockerfile
FROM directus/directus:12.2.0

USER root

RUN corepack enable \
  && pnpm add --dir /directus --save-exact \
    @sentry/node@10.69.0

COPY sentry-instrument.js /directus/sentry-instrument.js
ENV NODE_OPTIONS="--import /directus/sentry-instrument.js"

USER node
```

For a consumer project that already has a runtime-dependencies Docker stage, install the exact
packages there and copy its resulting `node_modules` into the final Directus image. The important
properties are that `require('@sentry/node')` resolves from the Directus process and that
`NODE_OPTIONS` points to the copied instrumentation file.

## Node instrumentation

Start Sentry before Directus loads the bundle. Guard initialization on the DSN so local images can
share the same file without sending events:

```js
// sentry-instrument.js
import * as Sentry from '@sentry/node'

const dsn = process.env.SENTRY_DSN?.trim()

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.DEPLOYMENT_ENV ?? 'development',
    tracesSampleRate: 0.1,
  })
}
```

To enable profiling, install the optional peer dependency `@sentry/profiling-node@10.69.0`, import
`nodeProfilingIntegration` in this file, and configure `integrations` and `profilesSampleRate` in
the consumer-owned instrumentation. Profiling is not initialized by the bundle.

If profiling is not wanted, omit both the profiling package and `nodeProfilingIntegration()`:

```js
import * as Sentry from '@sentry/node'

if (process.env.SENTRY_DSN?.trim()) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.DEPLOYMENT_ENV ?? 'development',
    tracesSampleRate: 0.1,
  })
}
```

The instrumentation file is responsible for global Directus process instrumentation. It is not
replaced by the bundle hook, and installing the bundle does not cause Directus to load it.

## Configuration

All values are Directus environment variables. Empty optional values should be omitted or supplied
as an empty string according to the consumer's environment-management conventions.

| Variable                    | Default       | Used by               | Description                                                                                               |
| --------------------------- | ------------- | --------------------- | --------------------------------------------------------------------------------------------------------- |
| `SENTRY_ENABLED`            | `false`       | Hook, test endpoint   | Master switch for the bundle. Set to `true` only in a prepared trusted runtime.                           |
| `SENTRY_DSN`                | unset         | Hook, instrumentation | Sentry DSN for Node error reporting. The hook skips the Express handler when it is absent.                |
| `SENTRY_LOADER_SCRIPT`      | unset         | Hook                  | Exact Sentry hosted loader `<script>` tag used for browser reporting.                                     |
| `SENTRY_RELEASE_PREFIX`     | `dev`         | Hook                  | Prefix for the browser release when `SENTRY_RELEASE` is not set.                                          |
| `SOURCE_COMMIT`             | `unknown`     | Hook                  | Commit suffix for the generated browser release.                                                          |
| `SENTRY_RELEASE`            | unset         | Hook                  | Explicit browser release override.                                                                        |
| `DEPLOYMENT_ENV`            | `development` | Hook, instrumentation | Deployment environment passed to Sentry. Supported values are `development`, `staging`, and `production`. |
| `SENTRY_TEST_SUITE_ENABLED` | `false`       | Test endpoint         | Enables the intentional-error endpoint when the master switch is also enabled.                            |

The loader script must use Sentry's hosted format and a 32-character hexadecimal project id:

```html
<script
  src="https://js-de.sentry-cdn.com/0123456789abcdef0123456789abcdef.min.js"
  crossorigin="anonymous"
></script>
```

Whitespace and newlines between the tag attributes are accepted.

The browser release is computed as the configured release prefix followed by `@` and the source
commit unless `SENTRY_RELEASE` is explicitly configured. The browser initializer also sets the
deployment environment and conservative replay sample rates.

## Bundle entries

### Server hook

The hook follows this sequence:

1. It starts setup logging and checks `SENTRY_ENABLED`.
2. It validates the complete environment from its sibling `src/env.schema.ts`.
3. It registers `Sentry.setupExpressErrorHandler(app)` only when `SENTRY_DSN` is configured.
4. It embeds the browser loader only when `SENTRY_LOADER_SCRIPT` is configured.
5. It completes setup after registration.

When the bundle is disabled, the hook does not load `@sentry/node`. This lets consumers keep the
bundle installed while local and CI environments use `SENTRY_ENABLED=false`.

### Test endpoint

The endpoint is available only when both switches are enabled:

```env
SENTRY_ENABLED=true
SENTRY_TEST_SUITE_ENABLED=true
```

It intentionally throws an error from `GET /sentry-test-endpoint`. Enable it only in a controlled
development or test environment; do not expose the intentional-error surface in production.

### Test module

The Data Studio module exposes a `Trigger Error` button. Clicking it calls the browser Sentry API:

```ts
const error = new Error('Intentional front end error for Sentry')
Sentry.captureException(error)
```

The embedded loader supplies the runtime `Sentry` global. The module does not bundle a browser
Sentry SDK. Verify that the loader script is configured and that the browser project accepts events.

## Using extension-utils Sentry helpers

For server-side extension code that needs structured events, import the explicit Sentry subpath:

```ts
import {
  addBreadcrumb,
  captureException,
  captureMessage,
  setUser,
} from '@onderwijsin/directus-extension-utils/sentry'

try {
  await publishArticle(articleId)
} catch (error) {
  captureException(error, {
    tags: {
      domain: 'publishing',
      operation: 'publishArticle',
      severity: 'high',
      component: 'hook',
      context: 'runtime',
    },
    extra: { articleId },
  })
  throw error
}
```

Capture a structured message:

```ts
captureMessage('Article publishing completed', 'info', {
  tags: {
    domain: 'publishing',
    operation: 'publishArticle',
    component: 'hook',
    context: 'runtime',
  },
  extra: { articleId },
})
```

Add breadcrumbs before a consequential operation and associate future events with an accountable
user:

```ts
addBreadcrumb('Publishing article', 'processing', 'info', { articleId })

setUser({
  id: accountability.user,
  email: accountability.email,
})
```

The Sentry utility subpath is explicit so consumers importing only common or server utilities do not
silently load the Sentry integration.

## Troubleshooting

### `Cannot find module '@sentry/node'`

The Directus runtime image does not contain the Node SDK. Install the exact Sentry dependencies in
the consumer Dockerfile or runtime-dependencies stage, rebuild the image, and verify resolution from
`/directus`.

### Events are not reported

Check all of the following:

```sh
echo "$SENTRY_ENABLED"
echo "$SENTRY_DSN"
echo "$SENTRY_LOADER_SCRIPT"
echo "$NODE_OPTIONS"
```

Then confirm that `sentry-instrument.js` is present at the path in `NODE_OPTIONS`, the DSN belongs
to the intended project, and the runtime can reach Sentry.

### Browser events are not reported

Configure the complete hosted loader tag, rebuild the bundle if the environment is embedded at
startup, and inspect the Data Studio browser console for loader or CSP errors.

### Local or CI unexpectedly reports events

Set `SENTRY_ENABLED=false`. This repository's local Compose and CI E2E defaults already set that
value; consumer Compose files and deployment manifests must preserve the same safe default.

## Security and compatibility

- Run the bundle only in a trusted, non-sandboxed Directus runtime.
- Keep DSNs and deployment credentials in secret management where appropriate.
- Keep the intentional test endpoint disabled outside controlled test environments.
- Pin Directus and Sentry versions in consumer images and test upgrades together.
- The bundle does not own Sentry organization, project, sampling, release, Docker, or
  instrumentation configuration.
