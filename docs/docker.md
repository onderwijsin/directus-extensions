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

The local Meilisearch service starts with `--upgrade-db`, so persisted development data is upgraded
automatically when the configured Meilisearch image changes. This is intentionally limited to local
Compose; E2E uses the shared service definition without the local override.

Local state is stored below `.data/`. Reset it only when discarding local data is intentional:

```sh
pnpm compose:reset
```

### Selective extension loading

By default, `compose.yaml` mounts all of `extensions/` at `/directus/extensions`. Keep this default
for development across the workspace. To load only selected extensions, copy the optional example:

```sh
cp compose.override.yaml.example compose.override.yaml
mkdir -p .data/snapshots
```

The copied `compose.override.yaml` is ignored by git and automatically merged by local Compose
commands, including `pnpm compose:up`. The example loads only the Schema Snapshot bundle, enables
its CLI, and persists manual snapshots in `.data/snapshots`. Automatic snapshots are disabled by
default; uncomment `SCHEMA_SPLIT_MANAGEMENT_AUTO_SNAPSHOT` in the copied override to enable them
explicitly. Build the selected extension before starting Directus:

```sh
pnpm build:utils
pnpm --filter @onderwijsin/directus-schema-snapshot-bundle build
docker compose config
pnpm compose:up
```

Selective mounts control only which extensions Directus loads. `pnpm dev` still builds and watches
all workspace extensions.

The example uses `volumes: !override`, which requires Docker Compose **2.24.4 or newer**.
[Docker's merge rules](https://docs.docker.com/reference/compose-file/merge/#replace-value) normally
merge volumes by container target. Adding individual mounts below `/directus/extensions/` would
therefore retain the base `/directus/extensions` mount and keep the other extensions available.
`!override` replaces the complete volume list.

Customize the copied file manually: add or remove individual extension mounts and adjust their
environment settings using each extension's README. Preserve the uploads, migrations, and email
template mounts, because replacing the list also removes those inherited mounts. The template mount
alone does not load the Magic Links bundle. Keep a dedicated writable snapshot directory: snapshot
creation clears its contents. The extra snapshot mount makes this example's output survive container
replacement; change its host path if snapshots should live in a version-controlled directory. See
the [Schema Snapshot README](../extensions/directus-schema-snapshot-bundle/README.md) for CLI
commands and configuration.

Inspect the effective local configuration with `docker compose config`. To inspect the base or
example explicitly, independently of a copied local override, use:

```sh
docker compose -f compose.yaml config
docker compose -f compose.yaml -f compose.override.yaml.example config
```

For the example, verify that `/directus/extensions` is absent and the only extension mount is
`/directus/extensions/directus-schema-snapshot-bundle`. Other services and shared environment
defaults are inherited. Removing the copied override restores the default extension selection.

## Shared topology

```text
frontend network: Directus
backend network:  Directus, PostgreSQL, Valkey, Garage, Mailpit, Meilisearch, Loops mock, AI metadata mock
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

The `garage-init` service is built from `docker/garage-init.Dockerfile`. Its init image copies the
`/garage` CLI from the same digest-pinned `dxflrs/garage:v2.3.0` image used by the Garage server, so
starting the one-shot service does not download a binary. When upgrading Garage, update the version
and manifest digest together in both `docker/compose.yaml` and `docker/garage-init.Dockerfile`; the
digest is the multi-architecture manifest digest.

The local defaults are intentionally development-only. Override them in an ignored `.env`:

```sh
cp .env.example .env
```

The local and E2E Compose stacks mount the magic-links bundle template directory at
`/directus/templates` and configure `EMAIL_TEMPLATES_PATH` accordingly. For E2E runs using a
different extension checkout, override `DIRECTUS_E2E_EMAIL_TEMPLATES_DIR` with the corresponding
host template directory.

## Custom migrations

```text
migrations/
├── bootstrap/    # Startup: stable project ID seed
└── post-schema/  # After required collections exist
```

The Compose stacks mount the shared `migrations/` directory at `/directus/migrations` and use two
phases. Startup sets `MIGRATIONS_PATH=/directus/migrations/bootstrap` to run only
`migrations/bootstrap/`, including the stable project ID seed. After Directus starts and extensions
have provisioned their collections, collection-dependent migrations use
`MIGRATIONS_PATH=/directus/migrations/post-schema`. Keep migrations that target extension-created
collections in `migrations/post-schema/`, never in the bootstrap phase. Keep migration identifiers
unique across both phases: Directus records them in one migration history.

For local Compose development, `pnpm compose:up` performs the bootstrap phase. After Directus has
started and every collection required by the post-schema migrations exists, apply them explicitly:

```sh
pnpm compose:migrate
```

The command uses `docker compose exec -e MIGRATIONS_PATH=...` to set the environment variable for
the newly executed CLI process. It does not modify the environment of the running Directus server.

This command selects `/directus/migrations/post-schema`; it does not provision missing collections.
The current Sluggernaut migration requires the redirects collection (`redirects` by default). A
fresh setup using the schema-snapshot-only override does not create that collection, so skip
`pnpm compose:migrate` unless the required schema has been provisioned. Do not run the post-schema
phase merely because Directus is healthy.

## E2E lifecycle

```text
build extensions
    ↓
start isolated Compose project
    ↓
wait for Compose health checks
    ↓
apply post-schema migrations
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

The E2E runner applies `/directus/migrations/post-schema` after Directus becomes healthy and before
Vitest starts. This is required for the Sluggernaut concurrency tests because the redirect
collection is created by `ensureDirectusSchema` during extension startup.

The runner does not collect Compose logs. Inspect a running stack manually with
`docker compose logs` when debugging locally; the runner always removes its project and disposable
resources afterwards.

The Loops bundle's E2E tests use the `loops-mock` service. It serves fixture-backed email-message
responses and records profile updates, so E2E runs do not require Loops credentials or contact the
live Loops API.

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

Directus and Mailpit publish fixed loopback-only ports by default (`18055` and `18025`). Override
`DIRECTUS_E2E_PORT` or `DIRECTUS_E2E_MAILPIT_PORT` when those ports are occupied. Garage and
Meilisearch remain internal Compose services and are not published to the host. Concurrent E2E runs
on the same machine are not supported.

The E2E runner stages the regular extension directory together with the private playground from
`tests/directus-e2e-playground` into a disposable extension tree, then mounts that tree read-only.
This keeps the playground outside the development Compose extension mount while avoiding nested bind
mounts, which Directus's read-only image cannot create reliably. It sets:

```yaml
EXTENSIONS_MUST_LOAD: 'true'
EXTENSIONS_AUTO_RELOAD: 'false'
```

Override a port or the packed consumer directory when needed:

```sh
DIRECTUS_E2E_PORT=28055 \
DIRECTUS_E2E_EXTENSIONS_DIR=/tmp/directus-extensions-consumer/extensions \
pnpm test:e2e
```

## Readiness and timeouts

| Operation                         |    Timeout |
| --------------------------------- | ---------: |
| Individual E2E operation/log poll | 60 seconds |
| Compose health checks             |  3 minutes |
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

Keep real credentials in ignored files or CI secrets. The E2E runner does not load the repository
`.env` file.

## Image metadata provider fixture

The E2E overlay starts `ai-metadata-mock` on the backend network and configures the image metadata
operations to use its OpenAI-compatible chat-completions endpoint. The mock requires an inline JPEG,
PNG, or WebP data URL, so successful generation verifies private image bytes reach the SDK adapter.
Portable input fixtures additionally verify exact byte preservation for acceptable inputs.
Oversized-image fixtures verify downscaling and original-pixel focal mapping; a generated noise
image verifies configured resize thresholds and warning-and-submit behavior above the soft byte-size
target. The test operation uses a 100,000-byte threshold, a 1200 px maximum, and a 640 px resize
target; a separate operation and unit tests verify the 500,000-byte threshold, 1500 px maximum, and
800 px target defaults. A controlled provider rejection verifies that completed transformation
diagnostics survive generation failures. It returns deterministic descriptions, tags, filename
stems, and normalized focal points without contacting an external AI provider. Focal-only fixtures
assert that only focal output is requested; oriented JPEG/TIFF/AVIF fixtures compare the provider
input with the canonical Directus WebP. Internal request barriers hold generation while tests edit
manual focal points or dimensions, verifying the transactional recheck. The mock returns only
enabled fields. The global fixture language is Dutch; the mock requires language instructions and
returns English metadata when an operation overrides the language to English.
