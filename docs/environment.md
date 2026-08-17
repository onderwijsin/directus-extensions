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
workspace extensions directory into Directus. `EXTENSIONS_AUTO_RELOAD` enables the local reload
loop.

The local development image is the regular Directus image. Hardened deployment images are a separate
deployment concern and do not change the local edit/build/reload workflow.

Directus uses Redis-backed data caching and synchronization, a 200 MB upload limit, TUS uploads,
local-development CORS and CSP settings, HSTS, and `MARKETPLACE_TRUST=sandbox`. These defaults keep
the local runtime explicit and easy to override.

## Environment files and defaults

The local Compose stack does not require a `.env` file. Its shared Compose file provides development
defaults for the database, cache, Directus, Garage, Mailpit, and Meilisearch settings, so a fresh
checkout can start with `pnpm compose:up`.

`.env.example` is the optional root-level template for local overrides:

```sh
cp .env.example .env
```

The copied root `.env` remains ignored by git. Values exported in the shell or defined in `.env`
override the inline Compose defaults. Keep real credentials in ignored local files or an external
secret manager; checked-in defaults are for local development and E2E isolation only.

The E2E runner does not require `.env`. It generates fresh, run-scoped credentials for the database,
cache, Directus, Garage, and Meilisearch, passes them to every Compose invocation, and removes the
associated containers and volumes afterward. CI provides `DIRECTUS_E2E_EXTENSIONS_DIR` and passes
the `DIRECTUS_LICENSE_KEY` GitHub secret to Directus as `LICENSE_KEY` when testing the packed
consumer. CI also pins `PUBLIC_URL` to `http://localhost:18055`, so license activation uses the same
absolute URL on every run.

The Sentry bundle is explicitly disabled by default in both local Compose and E2E Compose with
`SENTRY_ENABLED=false`. Enabling it requires the consumer to install the Sentry Node dependencies in
the Directus runtime image and provide a `sentry-instrument.js` file through `NODE_OPTIONS`; the
extension package does not provide either deployment artifact.
