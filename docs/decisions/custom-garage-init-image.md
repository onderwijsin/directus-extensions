# Decision: Use a custom image for Garage initialization

- **Status:** Accepted
- **Date:** 2026-08-24
- **Scope:** Local and E2E Compose Garage initialization

## Context

The one-shot `garage-init` service configures Garage before Directus starts. Previously, the service
used Alpine and downloaded the Garage CLI during every startup. Disposable E2E Compose projects
removed any opportunity to reuse that binary, so startup depended on an external download and its
integrity could not be verified independently.

## Decision

Build `garage-init` from `docker/garage-init.Dockerfile`. The image uses the digest-pinned
multi-architecture `dxflrs/garage:v2.3.0` image as a build stage and copies its `/garage` binary
into an Alpine runtime image together with `docker/garage-init.sh`.

The Garage server and init image therefore use the same upstream version and manifest digest. Docker
selects the matching Garage binary for the target platform; runtime architecture detection and
network downloads are not part of initialization. The image is built locally by Compose and is not
published separately.

`garage-init.sh` remains the owner of initialization logic. It waits for Garage RPC readiness,
configures the node layout, creates the configured bucket and access key when needed, and grants
read/write access. The service remains one-shot, and Directus continues to depend on successful
completion.

## Alternatives considered

- **Download the CLI at startup:** rejected because it is slower, depends on runtime network access,
  and does not provide strong binary provenance.
- **Maintain architecture-specific downloads and checksums:** rejected because it duplicates the
  upstream release matrix and creates a second version/integrity source to maintain.
- **Publish a repository-owned init image:** rejected because local Compose can build the small
  image directly and no release workflow is needed.

## Consequences

Garage initialization is reproducible without a runtime CLI download, while remaining supported on
the architectures present in the upstream Garage manifest. The init image must be rebuilt when its
source image changes.

When upgrading Garage, update the version and manifest digest together in both `docker/compose.yaml`
and `docker/garage-init.Dockerfile`, then rerun the Compose build and E2E checks. The digest used
here is the multi-architecture manifest digest, not a single-platform digest.

## Reconsideration criteria

Revisit this decision if the upstream Garage image stops publishing the CLI at `/garage`, no longer
supports a required platform, or the repository adopts a centrally published, equivalently
reproducible infrastructure image.
