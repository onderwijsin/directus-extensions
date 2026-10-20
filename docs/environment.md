# Local environment and Directus stack

The complete Compose contract is documented in [`docker.md`](docker.md). This article summarizes the
environment values used by the local and isolated E2E stacks.

The local environment uses one shared Directus `12.2.0` instance for all extensions.

## Services

The local Compose stack contains:

- `directus`, pinned to `directus/directus:12.2.0`;
- PostgreSQL/PostGIS;
- Valkey;
- S3-compatible storage;
- Mailpit; and
- Meilisearch.

Persist local data below `.data/`, keep secrets in ignored environment files, and use health checks
before starting Directus. The local stack uses separate frontend and backend networks: Directus
joins both, while infrastructure services join the backend network.

## Extension loading

Directus loads a built extension directory containing `package.json` and `dist/`. The local
development workflow builds or watches extensions into `extensions/<name>/dist` and mounts the
workspace extensions directory into Directus. The E2E-only `directus-e2e-playground` extension lives
under `tests/` and is mounted separately by the E2E Compose overlay. `EXTENSIONS_AUTO_RELOAD`
enables the local reload loop.

The local development image is the regular Directus image. Hardened deployment images are a separate
deployment concern and do not change the local edit/build/reload workflow.

Directus uses Redis-backed data caching and synchronization, a 200 MB upload limit,
local-development CORS and CSP settings, HSTS, and `MARKETPLACE_TRUST=sandbox`. TUS uploads are
disabled by default; set `TUS_ENABLED=true` when resumable uploads are required. These defaults keep
the local runtime explicit and easy to override.

## Environment files and defaults

The local Compose stack does not require a `.env` file. Its shared Compose file provides development
defaults for the database, cache, Directus, Garage, Mailpit, and Meilisearch settings, so a fresh
checkout can start with `pnpm compose:up`.

`.env.example` is the optional root-level template for local overrides:

```sh
cp .env.example .env
```

The copied root `.env` remains ignored by git. Compose reads it for **interpolation**; it does not
automatically forward its variables to the Directus container. Only values explicitly mapped in the
service's `environment` reach Directus. For those mappings, shell values take precedence over
`.env`, and `${VARIABLE:-default}` uses the default when the variable is unset or empty. See
[Docker's interpolation documentation](https://docs.docker.com/compose/how-tos/environment-variables/variable-interpolation/).
Keep real credentials in ignored local files or an external secret manager; checked-in defaults are
for local development and E2E isolation only.

The template marks examples that also require a Compose override. The local stack intentionally
fixes the Mailpit transport/connection and template path, the Redis URL, and internal database,
storage, and search service addresses. Advanced lock/rate-limiter settings, Coolify polling/policy
IDs, health exclusions, optional Magic Links email text/headers, and Sentry DSN/loader/release
overrides remain available through a Compose override. All other extension environment options
remain supported too; consult the extension's README rather than expecting every option in the
default Compose file.

For example, set `MAGIC_LINKS_EMAIL_SUBJECT=Your sign-in link` in `.env` and create a root-level
`compose.override.yaml`:

```yaml
services:
  directus:
    environment:
      MAGIC_LINKS_EMAIL_SUBJECT: ${MAGIC_LINKS_EMAIL_SUBJECT:?Set a non-empty subject in .env}
```

Compose automatically merges this override when running `pnpm compose:up`. Add only the options you
need; `:?` rejects missing or empty values for this optional string. Remove the mapping to restore
the extension's unset behavior. Avoid `${VARIABLE:-}` for optional values whose schemas reject empty
strings or whose fallbacks depend on absence, such as `SENTRY_RELEASE`. Extension-specific
`EDITOR_AI_*` and `AI_METADATA_WRITER_*` settings can be passed the same way. For external Redis,
override `REDIS`; component-based configuration also requires removing the preset URL, which takes
precedence over components.

Inspect the resolved configuration before starting containers:

```sh
docker compose config
```

The Coolify deployments bundle is enabled in local Compose and E2E Compose. Local Compose requires
one `COOLIFY_URL` and a `COOLIFY_TOKEN` with read and deploy access to every integrated Coolify
application. The collection and schema-change settings are optional and documented in the bundle
README. E2E Compose supplies harmless defaults and makes `COOLIFY_URL` and `COOLIFY_TOKEN`
configurable through the environment.

The E2E runner does not require `.env`. It generates fresh, run-scoped credentials for the database,
cache, Directus, Garage, and Meilisearch, stages the configured extension directory together with
the private E2E playground into a disposable tree, passes the staged tree to Compose, and removes it
along with the associated containers and volumes afterward. CI provides
`DIRECTUS_E2E_EXTENSIONS_DIR` and passes the `DIRECTUS_LICENSE_KEY` GitHub secret to Directus as
`LICENSE_KEY` when testing the packed consumer. CI also pins `PUBLIC_URL` to
`http://localhost:18055`, so license activation uses the same absolute URL on every run.

The Sentry bundle is explicitly disabled by default in both local Compose and E2E Compose with
`SENTRY_ENABLED=false`. This is an accepted repository decision:
[Sentry runtime configuration is deferred to consumers](decisions/defer-sentry-runtime-configuration-to-consumers.md).
Enabling it requires the consumer to install the Sentry Node dependencies in the Directus runtime
image and provide a `sentry-instrument.js` file through `NODE_OPTIONS`; the extension package does
not provide either deployment artifact.

## Image metadata operations

Local Compose passes `DIRECTUS_EXTENSIONS_AI_PROVIDER` (default `mistral`),
`DIRECTUS_EXTENSIONS_AI_MODEL` (default `mistral-medium-latest`), and
`DIRECTUS_EXTENSIONS_AI_API_KEY` (unset by default) from the root `.env` file to Directus. These
shared values configure both the Markdown Editor and image metadata operations. Extension-specific
`EDITOR_AI_*` and `AI_METADATA_WRITER_*` variables remain supported overrides; local Compose does
not set editor-specific provider, model, or API key defaults.

The image metadata bundle registers explicit-file and manual backfill operations. They resolve
server-only provider configuration from operation overrides, extension environment, shared AI
environment, and Directus credentials. See its
[README](../extensions/directus-ai-image-metadata-bundle/README.md) for configuration. Local Compose
consumers can supply those variables with a Compose override. The E2E overlay sets an
OpenAI-compatible provider pointing to `ai-metadata-mock`; no live AI credentials are required.
