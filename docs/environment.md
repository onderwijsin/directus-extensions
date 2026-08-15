# Local environment and Directus stack

The complete Compose contract is documented in [`docker.md`](docker.md). This article keeps the
short environment-level decisions that agents need when changing local services or secrets.

The local environment is one shared Directus 12.2.0 instance for all extensions.

## Services

The planned Compose stack contains:

- `directus`, pinned initially to `directus/directus:12.2.0`;
- PostgreSQL/PostGIS;
- Valkey;
- S3-compatible storage;
- Mailpit; and
- Meilisearch.

pgAdmin is intentionally not included. Persist local data below `.data/`, keep secrets in ignored
environment files, and use health checks before starting Directus. The local stack uses separate
frontend and backend networks: Directus joins both; infrastructure services join backend only.

## Extension loading

Directus loads a built extension directory containing `package.json` and `dist/`. The initial
development strategy builds or watches extensions into `extensions/<name>/dist` and mounts the
workspace extensions directory into Directus. `EXTENSIONS_AUTO_RELOAD` may be enabled for the local
loop.

The local development image is intentionally the regular Directus image. Hardened and distroless
images remove npm/npx and, for DHI, the shell; validate those constraints later in a production-like
image build rather than complicating the local edit/build/reload loop.

Directus uses Redis-backed data caching and synchronization, a 200 MB upload limit, TUS uploads,
local-development CORS and CSP settings, HSTS, and `MARKETPLACE_TRUST=sandbox`. These defaults keep
the local runtime close to the application stack while remaining explicit and easy to override.

## Compose options

Workspace output mounting is the default because it gives the fastest edit/build/reload loop. A
generated staging directory gives stronger source/output separation but needs orchestration. A
custom image is closest to production and is reserved for later packed-package and deployment
validation.
