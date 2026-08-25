# @onderwijsin/directus-loops-bundle

Opinionated Directus building blocks for synchronizing selected user profiles with Loops and
archiving Loops email campaigns.

The bundle provisions its campaign archive schema, the opt-in `loops_sync_enabled` field on
`directus_users`, and base policies. It verifies signed Loops webhook requests before they enter a
Directus Flow, persists sent campaigns and recipients, and mirrors opted-in user profile updates.

## Bundle entries

| Entry                   | Type           | Status                                                                         |
| ----------------------- | -------------- | ------------------------------------------------------------------------------ |
| `loops-webhook-hook`    | Hook           | Provisions schema, verifies signed webhooks, and syncs opted-in user profiles. |
| `loops-webhook-handler` | Flow operation | Validates and persists verified campaign webhook data.                         |

## Design boundary

Loops owns contacts’ marketing relationships, subscription status, and mailing-list membership.
Directus optionally mirrors selected user profile fields and owns the campaign archive. The bundle
does not provide a subscription-management collection, a subscribe proxy endpoint, or a local list
catalogue.

## Requirements

- Directus `^12.2.0`;
- Node.js `>=24.10.0`;
- a trusted, non-sandboxed Directus runtime;
- a Loops API key when the runtime behavior is enabled.

## Installation

```sh
pnpm add @onderwijsin/directus-loops-bundle
```

Install the package in the Directus runtime image and restart Directus. The bundle is discovered
automatically.

## Configuration

The hook provisions schema and policies during Directus startup. Automatic provisioning can be
disabled globally or for this bundle.

| Variable                                      | Default                               | Description                                                           |
| --------------------------------------------- | ------------------------------------- | --------------------------------------------------------------------- |
| `LOOPS_ENABLED`                               | `true`                                | Master switch for the bundle.                                         |
| `LOOPS_SYNC_ENABLED`                          | `true`                                | Enables Directus user schema extension and profile synchronization.   |
| `LOOPS_API_KEY`                               | —                                     | Server-side Loops API key used for campaign fetches and profile sync. |
| `LOOPS_WEBHOOK_SIGNING_SECRET`                | —                                     | Enables Loops signature verification for Flow webhooks.               |
| `LOOPS_WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS`   | `300`                                 | Maximum age of an accepted signed webhook.                            |
| `LOOPS_API_BASE_URL`                          | `https://app.loops.so`                | Loops API base URL; override for deterministic integration tests.     |
| `LOOPS_WEBHOOK_EVENT_ALLOWLIST`               | `campaign.email.sent,contact.deleted` | Valid webhook event names accepted for processing.                    |
| `LOOPS_CAMPAIGN_PROCESSING_LEASE_MS`          | `300000`                              | Lease before a stale campaign claim is retried.                       |
| `LOOPS_LMX_PARSING_MODE`                      | `best_effort`                         | Use `strict` to fail ingestion when parser diagnostics occur.         |
| `LOOPS_SYNC_ENABLED_FIELD`                    | `loops_sync_enabled`                  | Directus user field used as the profile-sync opt-in.                  |
| `LOOPS_CAMPAIGNS_COLLECTION`                  | `loops_campaigns`                     | Campaign archive collection name.                                     |
| `LOOPS_CAMPAIGN_RECIPIENTS_COLLECTION`        | `loops_campaign_recipients`           | Recipient collection name.                                            |
| `LOOPS_SCHEMA_CHANGES_ENABLED`                | `true`                                | Enables this bundle’s schema provisioning.                            |
| `LOOPS_SCHEMA_ABORT_ON_ERROR`                 | `true`                                | Aborts startup provisioning after an unexpected error.                |
| `LOOPS_MANAGE_EMAIL_CAMPAIGNS_POLICY_ENABLED` | `true`                                | Seeds the campaign-management policy.                                 |
| `LOOPS_VIEW_EMAIL_CAMPAIGNS_POLICY_ENABLED`   | `true`                                | Seeds the public/current-user campaign-view policy.                   |
| `DIRECTUS_EXTENSIONS_SCHEMA_CHANGES_ENABLED`  | `true`                                | Global schema provisioning gate.                                      |
| `DIRECTUS_EXTENSIONS_DATA_SEED_ENABLED`       | `true`                                | Global policy/data provisioning gate.                                 |

The schema and policy definitions are managed by the hook’s locked startup coordinator. Consumers
may disable automatic provisioning and create compatible collections and policies themselves.

The bundle uses the official Loops SDK for API requests. It does not add application-level retries;
contact profile updates are mutations and are not retried to avoid duplicating writes.

Set `LOOPS_SYNC_ENABLED=false` to keep campaign/webhook functionality while skipping the
`directus_users` schema extension and profile-sync hook registration.

When `LOOPS_WEBHOOK_SIGNING_SECRET` is configured, the hook intercepts the Directus webhook Flow
route family before JSON parsing. It verifies Loops requests against their raw body, rejects invalid
signatures, and forwards only a verified marker and webhook ID to the Flow trigger data chain. The
operation requires the verified marker. Requests without Loops webhook headers pass through to
unrelated webhook Flows.

The default handler processes `campaign.email.sent` and `contact.deleted`. A deleted Loops contact
with a `userId` causes the configured Directus user synchronization flag to be set to `false`. This
prevents a later Directus profile update from recreating the deleted Loops contact. A deletion for a
contact without a Directus `userId`, or for a user that no longer exists, is acknowledged as a
no-op.

The seeded policies are:

- `Can manage email campaigns`: full CRUD on campaigns and read access to recipients;
- `Can view email campaigns`: read access to public campaign fields and recipient records whose
  `directus_user` matches the current Directus user.

## Profile synchronization

The hook adds `loops_sync_enabled` to `directus_users`. This is an opt-in mirror flag, not a
subscription or consent field. When enabled, updates to `email`, `first_name`, or `last_name` are
sent to Loops using the Directus user ID as the stable Loops `userId`. Enabling the flag on an
update also sends the current profile. User creation is intentionally ignored so applications can
create a Directus user and then use the existing newsletter-signup package to create the Loops
contact with mailing-list membership in one signup flow.

Profile synchronization is best effort: a failed Loops request is logged and does not roll back the
completed Directus mutation. Loops remains the owner of subscription status and mailing-list
membership.
