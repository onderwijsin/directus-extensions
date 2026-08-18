# Docker and Compose

The repository has two Compose stacks:

| Stack | File                     | Purpose                               | Command           |
| ----- | ------------------------ | ------------------------------------- | ----------------- |
| Local | `compose.yaml`           | Development with workspace extensions | `pnpm compose:up` |
| E2E   | `tests/compose.e2e.yaml` | Isolated packed-extension checks      | `pnpm test:e2e`   |

Both extend the shared service definitions in `docker/compose.yaml`.

## Local development

Start and inspect the local stack:

```sh
pnpm compose:up
pnpm compose:logs
pnpm compose:down
```

For extension watch mode:

```sh
pnpm dev
```

The main endpoints are:

| Service     | URL                     |
| ----------- | ----------------------- |
| Directus    | <http://localhost:8055> |
| Mailpit     | <http://localhost:8025> |
| Meilisearch | <http://localhost:7700> |
| Garage S3   | internal by default     |

Local state is stored below `.data/`. Reset it only when discarding local data is intentional:

```sh
pnpm compose:reset
```

## Shared topology

```text
frontend network: Directus
backend network:  Directus, PostgreSQL, Valkey, Garage, Mailpit, Meilisearch
```

Directus joins both networks. Infrastructure services join only `backend`.

The shared service configuration provides:

- PostgreSQL/PostGIS;
- Valkey cache and synchronization;
- Garage S3-compatible storage;
- Mailpit SMTP capture;
- Meilisearch;
- Directus WebSockets and extension loading; and
- the stable local project ID migration.

The local defaults are intentionally development-only. Override them in an ignored `.env`:

```sh
cp .env.example .env
```

The local and E2E Compose stacks mount the magic-links bundle template directory at
`/directus/templates` and configure `EMAIL_TEMPLATES_PATH` accordingly. For E2E runs using a
different extension checkout, override `DIRECTUS_E2E_EMAIL_TEMPLATES_DIR` with the corresponding
host template directory.

## E2E lifecycle

```text
build extensions
    ↓
start isolated Compose project
    ↓
wait for database, cache, Garage, search, Mailpit, Directus
    ↓
native admin login → DIRECTUS_E2E_TOKEN
    ↓
run Vitest project `e2e`
    ↓
remove containers, networks, and named volumes
```

Run it with:

```sh
pnpm test:e2e
```

The runner uses a unique Compose project name and run-scoped credentials. It removes all disposable
resources in `finally`, including interrupted runs. It never stops the shared Docker daemon.

Individual tests own their Directus fixtures:

```ts
const disposeCollection = await createPlaygroundCollection()
try {
  await client.request(createItem('posts', { title: 'E2E item' }))
} finally {
  await disposeCollection()
}
```

The shared runner does not create application collections or access-control fixtures.

## E2E ports and mounts

| Service     | E2E host port |
| ----------- | ------------: |
| Directus    |       `18055` |
| Mailpit     |       `18025` |
| Garage S3   |       `13900` |
| Meilisearch |       `17700` |

The E2E stack mounts the regular extension directory read-only and adds the private playground
extension from `tests/directus-e2e-playground`. It sets:

```yaml
EXTENSIONS_MUST_LOAD: 'true'
EXTENSIONS_AUTO_RELOAD: 'false'
```

Override ports or the packed consumer directory when needed:

```sh
DIRECTUS_E2E_PORT=28055 \
DIRECTUS_E2E_EXTENSIONS_DIR=/tmp/directus-extensions-consumer/extensions \
pnpm test:e2e
```

## Readiness and timeouts

| Operation                         |    Timeout |
| --------------------------------- | ---------: |
| Individual E2E operation/log poll | 60 seconds |
| Service readiness                 |  3 minutes |
| Garage initialization             |  5 minutes |
| Compose startup/child process     | 15 minutes |

The first startup may take one to eight minutes while images and dependencies become ready.

## Packed CI consumer

CI validates packed artifacts in a clean consumer:

```sh
pnpm build
pnpm pack:packages /tmp/directus-extensions-packages
pnpm prepare:e2e-consumer \
  /tmp/directus-extensions-packages \
  /tmp/directus-extensions-consumer

DIRECTUS_E2E_EXTENSIONS_DIR=/tmp/directus-extensions-consumer/extensions \
pnpm test:e2e
```

The preparation script installs packed archives and copies each extension’s `package.json` and
`dist/` into the directory Directus loads.

## Troubleshooting

Collect logs without stopping the Docker daemon:

```sh
docker compose -f docker/compose.yaml -f tests/compose.e2e.yaml logs --no-color
```

If a service is still starting, wait through the configured readiness window before diagnosing a
failure. Keep real credentials in ignored files or CI secrets.
