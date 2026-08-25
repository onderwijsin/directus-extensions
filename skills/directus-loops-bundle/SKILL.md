---
name: directus-loops-bundle
description: Install and use the Directus Loops integration bundle.
---

# @onderwijsin/directus-loops-bundle

The Directus Loops bundle provisions the campaign archive schema and base policies, verifies signed
Loops webhook requests, persists campaign webhooks with idempotent campaign and recipient writes,
and mirrors opted-in Directus user profiles. Consult the repository-level
`loops-integration-light-plan.md` for the agreed architecture and V1 scope.

## Install and use

Install the package in a trusted Directus runtime:

```sh
pnpm add @onderwijsin/directus-loops-bundle
```

Restart Directus after installation. The bundle is discovered automatically.

The package exposes these bundle entries:

- `loops-webhook-hook`
- `loops-webhook-handler`

Configure `LOOPS_WEBHOOK_SIGNING_SECRET` to enable signed webhook verification before using the
handler in a production Flow.

The hook provisions `loops_sync_enabled` on `directus_users`. It is an opt-in profile-mirroring
flag, not a marketing subscription field. On updates, enabled users have `email`, `first_name`, and
`last_name` sent to Loops with the Directus user ID as `userId`; user creation is intentionally not
synced so the newsletter-signup package can create the contact and apply list membership in one
flow.

## Configuration

| Variable                                      | Default                               | Description                                                       |
| --------------------------------------------- | ------------------------------------- | ----------------------------------------------------------------- |
| `LOOPS_ENABLED`                               | `true`                                | Master switch for the bundle.                                     |
| `LOOPS_SYNC_ENABLED`                          | `true`                                | Enables user schema extension and profile synchronization.        |
| `LOOPS_API_KEY`                               | —                                     | Server-side Loops API key for campaign fetches and profile sync.  |
| `LOOPS_WEBHOOK_SIGNING_SECRET`                | —                                     | Enables Loops signature verification for Flow webhooks.           |
| `LOOPS_WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS`   | `300`                                 | Maximum age of an accepted signed webhook.                        |
| `LOOPS_API_BASE_URL`                          | `https://app.loops.so`                | Loops API base URL; override for deterministic integration tests. |
| `LOOPS_WEBHOOK_EVENT_ALLOWLIST`               | `campaign.email.sent,contact.deleted` | Valid event names accepted for processing.                        |
| `LOOPS_CAMPAIGN_PROCESSING_LEASE_MS`          | `300000`                              | Lease before a stale campaign claim is retried.                   |
| `LOOPS_LMX_PARSING_MODE`                      | `best_effort`                         | `strict` fails ingestion on parser diagnostics.                   |
| `LOOPS_SYNC_ENABLED_FIELD`                    | `loops_sync_enabled`                  | Directus user opt-in field name.                                  |
| `LOOPS_CAMPAIGNS_COLLECTION`                  | `loops_campaigns`                     | Campaign archive collection name.                                 |
| `LOOPS_CAMPAIGN_RECIPIENTS_COLLECTION`        | `loops_campaign_recipients`           | Recipient collection name.                                        |
| `LOOPS_SCHEMA_CHANGES_ENABLED`                | `true`                                | Enables bundle schema provisioning.                               |
| `LOOPS_SCHEMA_ABORT_ON_ERROR`                 | `true`                                | Aborts provisioning after an unexpected error.                    |
| `LOOPS_MANAGE_EMAIL_CAMPAIGNS_POLICY_ENABLED` | `true`                                | Seeds the management policy.                                      |
| `LOOPS_VIEW_EMAIL_CAMPAIGNS_POLICY_ENABLED`   | `true`                                | Seeds the view policy.                                            |
| `DIRECTUS_EXTENSIONS_SCHEMA_CHANGES_ENABLED`  | `true`                                | Global schema gate.                                               |
| `DIRECTUS_EXTENSIONS_DATA_SEED_ENABLED`       | `true`                                | Global policy/data gate.                                          |

The seeded management policy provides full campaign CRUD and recipient read access. The view policy
provides public campaign fields and recipient read access filtered to the current Directus user.

The bundle uses the official Loops SDK for API requests and does not add application-level retries.
Contact profile updates are mutations and are not retried to avoid duplicating writes.

Set `LOOPS_SYNC_ENABLED=false` to skip the `directus_users` schema extension and profile-sync hook
while keeping campaign and webhook functionality enabled.

When `LOOPS_WEBHOOK_SIGNING_SECRET` is configured, signed Loops requests to Directus webhook Flows
are verified before parsing. The handler operation receives the verified marker, webhook ID, and
validated webhook event through the Flow data chain; the raw request body is not forwarded. Requests
without Loops webhook headers remain available to unrelated webhook Flows.

The default handler also processes `contact.deleted`. When the event includes a Directus `userId`,
it sets the configured synchronization flag to `false`, preventing a later Directus profile update
from recreating the deleted Loops contact. Missing identities and already-deleted Directus users are
acknowledged as no-ops.
