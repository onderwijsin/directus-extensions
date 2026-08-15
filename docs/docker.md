# Docker and Compose

This repository has two Compose stacks with one shared service configuration:

- the local development stack in [`compose.yaml`](../compose.yaml); and
- the isolated Directus E2E stack in [`tests/compose.e2e.yaml`](../tests/compose.e2e.yaml).

The shared fragments under [`docker/`](../docker/) are the source of truth for database, cache,
Directus application defaults, Mailpit, storage, search, and network configuration. The two stack
files provide only environment-specific wiring such as ports, volumes, dependencies, and E2E
extension mounts.

## Local development stack

Start the stack from the repository root:

```sh
pnpm compose:up
```

This builds the workspace packages first, then starts the services. For an extension watch loop:

```sh
pnpm dev
```

The local stack contains:

| Service       | Purpose                                                        | Host address            |
| ------------- | -------------------------------------------------------------- | ----------------------- |
| `directus`    | Directus 12.2.0 and workspace extensions                       | <http://localhost:8055> |
| `database`    | PostgreSQL with PostGIS                                        | Internal only           |
| `cache`       | Valkey with Redis-compatible cache and synchronization storage | Internal only           |
| `garage`      | Local S3-compatible object storage                             | Internal only           |
| `garage-init` | Initializes the Garage layout, bucket, and credentials         | No persistent process   |
| `mailpit`     | Local SMTP capture and inbox                                   | <http://localhost:8025> |
| `meilisearch` | Local search service                                           | <http://localhost:7700> |

Local state is stored below `.data/` and is ignored by git. `pnpm compose:reset` removes the local
Compose volumes and should only be used when discarding that state is intentional.

## Networks

The stack uses two explicit networks:

- `frontend` is the application-facing network. Directus joins this network so it can later be
  connected to other application-facing services without exposing infrastructure broadly.
- `backend` contains the database, cache, storage, mail, and search services. Directus joins it as
  the only application service that needs to reach those dependencies.

The separation mirrors the application deployment shape and makes accidental infrastructure exposure
less likely. It adds little operational cost because Docker Compose creates and manages the networks
automatically.

## Directus application defaults

The shared Directus fragment enables the application-level settings needed by the real development
stack:

- Redis-backed data caching with automatic purge;
- Redis-backed synchronization for multiple Directus processes;
- database pool bounds of 0–10 connections;
- a 200 MB upload limit;
- TUS uploads;
- local-development CORS and CSP allowances;
- HSTS;
- `MARKETPLACE_TRUST=sandbox`;
- extension auto-reload and WebSockets; and
- telemetry disabled.

These values are local defaults and can be overridden through `.env`. The CSP defaults allow local
origins for frames and frame ancestors; add narrower values when a consuming application needs a
specific policy.

## Database and cache configuration

The database and cache fragments follow the Tio Directus development approach while remaining
portable between the local and E2E stacks:

- PostgreSQL uses the shared lean PostGIS image, explicit development resource limits, tuned worker,
  memory, WAL, autovacuum, and statement-logging settings, and SSL disabled for local development.
- Valkey uses explicit memory limits, `allkeys-lru` eviction, bounded persistence, I/O threads, and
  lazy-free settings.
- Both services expose health checks and run only on the backend network.

The local stack uses bind mounts under `.data/`; the E2E stack uses named volumes so the runner can
remove the database, cache, and Mailpit state completely after each run.

## Storage choice

The local stack uses the same simple Garage setup for development and E2E does not start object
storage because the current E2E contract does not exercise file uploads. This is sufficient for the
current extension workspace. Tio’s more elaborate storage configuration is valuable when the
application needs generated credentials, Garage RPC/admin/metrics control, production-like startup,
or Cloudinary parity. Those concerns should be added when this repository gains storage-dependent
extensions or production-image validation; they are not required for the current local loop.

## E2E stack

Run the isolated E2E path with:

```sh
pnpm e2e
```

The runner:

1. builds the extensions;
2. starts the E2E Compose project with a unique project name;
3. waits for PostgreSQL, Valkey, and Directus;
4. creates the test collection and field through the Directus API;
5. runs the E2E Vitest project against the mounted extension artifact; and
6. removes the containers, network, and named volumes in a `finally` block.

The E2E stack reuses the local database, cache, Directus application, Mailpit, and network
definitions. It intentionally differs by using named volumes, port `18055`, read-only extension
mounts, `EXTENSIONS_MUST_LOAD=true`, and disabled extension auto-reload. It does not include Garage
or Meilisearch because the current E2E contract does not exercise storage or search.

CI prepares a clean consumer from packed extension artifacts and sets `DIRECTUS_E2E_EXTENSIONS_DIR`
to that consumer’s extension directory before invoking the same E2E runner.

## Environment files

Copy `.env.example` to `.env` for local overrides. Defaults are intentionally suitable only for
local development. Keep real secrets and machine-specific values in ignored files. Common overrides
include database credentials, Directus secrets, cache settings, upload limits, CORS/CSP policy,
HSTS, and Marketplace trust.

## Useful commands

```sh
pnpm compose:logs
pnpm compose:down
pnpm compose:reset
pnpm e2e
```
