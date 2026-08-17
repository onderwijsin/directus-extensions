# Docker and Compose

This repository has two Compose stacks with one shared service configuration:

- the local development stack in [`compose.yaml`](../compose.yaml); and
- the isolated Directus E2E stack in [`tests/compose.e2e.yaml`](../tests/compose.e2e.yaml).

The shared service definitions in [`docker/compose.yaml`](../docker/compose.yaml) are the source of
truth for database, cache, Directus application defaults, Mailpit, storage, search, and network
configuration. The two stack files provide only environment-specific wiring such as ports, volumes,
dependencies, and E2E extension mounts.

## Local development stack

Start the stack from the repository root:

```sh
pnpm compose:up
```

The first startup can take one to five minutes, depending on available image and dependency cache
hits. An unresponsive service during that window is still starting and should not be treated as a
failed stack after only one minute.

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

- `frontend` is the application-facing network. Directus joins this network for application-facing
  traffic without exposing infrastructure broadly.
- `backend` contains the database, cache, storage, mail, and search services. Directus joins it as
  the only application service that needs to reach those dependencies.

The separation mirrors the application deployment shape and makes accidental infrastructure exposure
less likely. It adds little operational cost because Docker Compose creates and manages the networks
automatically.

## Directus application defaults

The shared Directus service enables the application-level settings needed by the real development
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

The database and cache services follow the Tio Directus development approach while remaining
portable between the local and E2E stacks:

- PostgreSQL uses the shared lean PostGIS image, explicit development resource limits, tuned worker,
  memory, WAL, autovacuum, and statement-logging settings, and SSL disabled for local development.
- Valkey uses explicit memory limits, `allkeys-lru` eviction, bounded persistence, I/O threads, and
  lazy-free settings.
- Both services expose health checks and run only on the backend network.

The local stack uses bind mounts under `.data/`; the E2E stack uses named volumes so the runner can
remove the database, cache, and Mailpit state completely after each run.

## Storage choice

The local and E2E stacks use Garage as an S3-compatible object store. The shared storage service
keeps the Garage image and downloaded CLI version aligned, renders configuration from environment
variables, and separates S3 credentials from Garage RPC, admin, and metrics tokens. The
`garage-init` job waits for the RPC service, configures a single-node layout, creates the bucket,
imports the S3 key, and grants read/write access idempotently.

Garage’s metadata and object data use bind mounts locally and isolated named volumes in E2E. The
admin and metrics APIs listen only on the Docker network unless a stack-specific override exposes
them. The development defaults are not production secrets; set `GARAGE_RPC_SECRET`,
`GARAGE_ADMIN_TOKEN`, and `GARAGE_METRICS_TOKEN` in `.env` when local tooling needs distinct values.

## E2E stack

Run the isolated E2E path with:

```sh
pnpm test:e2e
```

The runner:

1. builds the extensions;
2. starts the E2E Compose project with a unique project name;
3. waits for PostgreSQL, Valkey, Garage initialization, Meilisearch, Mailpit, and Directus;
4. creates the test collection and field through the Directus API;
5. runs the E2E Vitest project against the mounted extension artifact; and
6. removes the containers, network, and named volumes in a `finally` block.

The E2E stack reuses the local database, cache, Directus application, Mailpit, Garage storage,
Meilisearch, and network definitions. It intentionally differs by using isolated named volumes,
ports `18055` (Directus), `18025` (Mailpit), `13900` (Garage S3), and `17700` (Meilisearch),
read-only extension mounts, `EXTENSIONS_MUST_LOAD=true`, and disabled extension auto-reload. The
runner explicitly waits for Garage initialization, then probes Directus, Mailpit, Garage S3, and
Meilisearch before seeding the test collection. It emits timestamped phase messages and streams
child-process output to make slow startup visible in CI. Individual E2E operations and cleanup
commands time out after 60 seconds; Compose startup retains a longer 15-minute budget. The Garage
initialization logs are sampled every 5 seconds, service probes wait up to three minutes, Garage
completion waits up to five minutes, and child processes are bounded by a fifteen-minute timeout.
The initialization step also reports its download, RPC readiness, layout, bucket, and key stages;
its CLI download has bounded retries so network stalls fail with a useful diagnostic.

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
pnpm test:e2e
```
