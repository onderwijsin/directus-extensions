# @onderwijsin/directus-loops-bundle

Directus extensions for archiving sent Loops campaigns, verifying Loops webhooks, and optionally
mirroring opted-in Directus user profiles to Loops.

The bundle is designed to work with the Onderwijs in Nuxt modules:

- [`@onderwijsin/nuxt-newsletter-signup`](https://github.com/onderwijsin/nuxt-modules/tree/main/modules/newsletter-signup)
  creates a Loops contact and applies mailing-list membership during signup.
- [`@onderwijsin/nuxt-loops-renderer`](https://github.com/onderwijsin/nuxt-modules/tree/main/modules/loops-renderer)
  renders the stored `loops_ast` campaign content in a Nuxt application.

## What this bundle provides

| Entry                   | Directus type  | Purpose                                                                                                      |
| ----------------------- | -------------- | ------------------------------------------------------------------------------------------------------------ |
| `loops-webhook-hook`    | Hook           | Provisions schema and policies, verifies Loops webhook requests, and mirrors eligible user updates.          |
| `loops-webhook-handler` | Flow operation | Validates verified Loops events and archives campaign sends or disables profile sync after contact deletion. |

Loops remains the source of truth for contacts, consent, subscription status, and mailing-list
membership. The bundle owns the Directus campaign archive and the optional profile-mirroring flag.

The bundle does not provide a signup endpoint, subscription-management UI, list catalogue, Loops
dashboard, or client-side API-key handling.

## Requirements

- Directus `^12.2.0`;
- Node.js `>=24.10.0`;
- a trusted, non-sandboxed Directus runtime;
- a Loops API key for profile synchronization or campaign archiving;
- a Loops webhook signing secret for signed webhook verification; and
- a public Directus URL reachable by Loops for webhook delivery.

## Installation

```sh
pnpm add @onderwijsin/directus-loops-bundle
```

Install the package in the Directus runtime image or project and restart Directus. The published
bundle is discovered automatically; no manual entry registration is required.

## Setup

### 1. Configure the Directus environment

```dotenv
LOOPS_ENABLED=true
LOOPS_API_KEY=your_loops_api_key
LOOPS_WEBHOOK_SIGNING_SECRET=your_loops_webhook_signing_secret
```

Keep both secrets server-side. Never expose them through Nuxt public runtime config or browser code.
Restart Directus after changing environment variables.

### 2. Confirm startup provisioning

On startup, the hook creates or reconciles:

- `loops_campaigns`, the campaign archive;
- `loops_campaign_recipients`, one send-event record per recipient;
- `directus_users.loops_sync_enabled`, when profile synchronization is enabled; and
- the optional `Can manage email campaigns` and `Can view email campaigns` policies.

Provisioning is coordinated across Directus instances. The default is to abort startup after an
unexpected provisioning error; see the configuration table for the override.

### 3. Create the Directus Flow

Create a Flow with these steps:

1. Add a **Webhook** trigger.
2. Set the trigger to receive `POST` requests.
3. Add the **Loops Webhook Handler** operation (`loops-webhook-handler`).
4. Publish the Flow and copy its generated trigger URL.

The operation has no configurable options. It reads the verified event from the webhook trigger. It
rejects requests that were not verified by the bundle, so do not call it from an unrelated trigger.

### 4. Add the Flow URL and signing secret in Loops

Follow the [Loops webhook setup guide](https://loops.so/docs/webhooks). In the Loops dashboard, open
**Settings → Webhooks**, paste the Directus Flow trigger URL into the endpoint field, and enable the
events you want to receive:

```text
https://directus.example.com/flows/trigger/<flow-id>
```

Loops displays a signing secret for the webhook in the dashboard. Copy that secret into the Directus
server environment as `LOOPS_WEBHOOK_SIGNING_SECRET`. The secret must match exactly. The bundle
verifies `webhook-id`, `webhook-timestamp`, and `webhook-signature` against the raw request body
before Directus parses it.

The default allowlist accepts `campaign.email.sent` and `contact.deleted`; enable those events in
the Loops dashboard. Loops currently supports one webhook endpoint per account, so use this endpoint
for all events handled by the bundle.

For `campaign.email.sent`, the operation uses the Loops API to fetch the canonical email message,
parses its LMX, stores a renderer-compatible AST, and stores the recipient send event. For
`contact.deleted`, it disables the matching Directus user's sync flag when the event contains a
Directus `userId`.

### 5. Assign policies and review permissions

When enabled, the bundle seeds these policies:

- **Can manage email campaigns**: full CRUD on the campaign archive and read access to recipients.
- **Can view email campaigns**: read access to public campaign fields and to the current user's
  recipient records.

The view policy intentionally does not expose raw Loops responses, raw LMX, ingestion diagnostics,
or internal processing fields. Review and assign the policies to the roles that need them; the
bundle does not assign roles automatically.

### 6. Enable profile synchronization per user (optional)

Set `directus_users.loops_sync_enabled` to `true` for a user whose profile should be mirrored. On an
update to `email`, `first_name`, or `last_name`, the bundle sends the current values to Loops using
the Directus user ID as the stable Loops `userId`.

This flag is an integration opt-in, not marketing consent. User creation is intentionally not
synced. Use `@onderwijsin/nuxt-newsletter-signup` when a signup must create a Loops contact and
apply a mailing list.

## Configuration

Directus parses boolean, number, array, and string values according to its environment handling.
Blank optional secrets are treated as unset. Collection and field names must match
`^[A-Za-z_][A-Za-z0-9_$]*$`.

### Bundle and API

| Variable             | Default                | Description                                                                                                          |
| -------------------- | ---------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `LOOPS_ENABLED`      | `true`                 | Master switch. `false` disables all bundle registration and side effects.                                            |
| `LOOPS_API_KEY`      | unset                  | Server-only Loops API key. Required for campaign archiving and profile synchronization.                              |
| `LOOPS_API_BASE_URL` | `https://app.loops.so` | Loops API origin. Override only for a compatible proxy or deterministic integration test.                            |
| `LOOPS_SYNC_ENABLED` | `true`                 | Adds the user opt-in field and registers profile synchronization. Campaign archiving remains available when `false`. |

### Webhooks and ingestion

| Variable                                    | Default                               | Description                                                                                              |
| ------------------------------------------- | ------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `LOOPS_WEBHOOK_SIGNING_SECRET`              | unset                                 | Enables signature verification for Directus webhook Flow routes.                                         |
| `LOOPS_WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS` | `300`                                 | Maximum accepted age of a signed webhook. Must be a non-negative integer.                                |
| `LOOPS_WEBHOOK_EVENT_ALLOWLIST`             | `campaign.email.sent,contact.deleted` | Event names passed to the handler. Use a non-empty array.                                                |
| `LOOPS_CAMPAIGN_PROCESSING_LEASE_MS`        | `300000`                              | Lease duration before a stale concurrent campaign claim can be retried. Must be positive.                |
| `LOOPS_LMX_PARSING_MODE`                    | `best_effort`                         | `best_effort` stores a partial result with diagnostics; `strict` fails when parsing reports diagnostics. |

### Schema and policies

| Variable                                      | Default                     | Description                                                                         |
| --------------------------------------------- | --------------------------- | ----------------------------------------------------------------------------------- |
| `LOOPS_SYNC_ENABLED_FIELD`                    | `loops_sync_enabled`        | Field added to `directus_users` for profile-sync opt-in.                            |
| `LOOPS_CAMPAIGNS_COLLECTION`                  | `loops_campaigns`           | Campaign archive collection name.                                                   |
| `LOOPS_CAMPAIGN_RECIPIENTS_COLLECTION`        | `loops_campaign_recipients` | Recipient archive collection name.                                                  |
| `LOOPS_SCHEMA_CHANGES_ENABLED`                | `true`                      | Disables this bundle's schema and policy provisioning when `false`.                 |
| `LOOPS_SCHEMA_ABORT_ON_ERROR`                 | `true`                      | Aborts startup provisioning after an unexpected schema or policy error when `true`. |
| `LOOPS_MANAGE_EMAIL_CAMPAIGNS_POLICY_ENABLED` | `true`                      | Seeds the management policy when `true`.                                            |
| `LOOPS_VIEW_EMAIL_CAMPAIGNS_POLICY_ENABLED`   | `true`                      | Seeds the view policy when `true`.                                                  |
| `DIRECTUS_EXTENSIONS_SCHEMA_CHANGES_ENABLED`  | `true`                      | Global Directus Extensions schema-provisioning gate.                                |
| `DIRECTUS_EXTENSIONS_DATA_SEED_ENABLED`       | `true`                      | Global Directus Extensions policy/data-provisioning gate.                           |

If automatic provisioning is disabled, create compatible collections, fields, relations, and
policies yourself. Custom collection names must be configured consistently before the Flow runs.

## Archive schema

The default campaign collection contains:

`loops_campaign_id`, `loops_email_message_id`, `campaign_name`, `subject`, `preview_text`,
`from_name`, `from_email`, `reply_to_email`, `cc_email`, `bcc_email`, `language_code`,
`email_format`, `raw_loops_response`, `raw_lmx`, `loops_ast`, `mailing_list_ids`, `sent_at`,
`loops_updated_at`, `ingestion_status`, `ingestion_error`, and `processing_started_at`.

The recipient collection contains `campaign`, `directus_user`, `loops_contact_id`, `loops_email_id`,
`email`, and `sent_at`. Campaign and recipient writes are idempotent, and a processing lease allows
stale concurrent work to be retried.

## Nuxt integration

### Signup and profile sync

Use
[`@onderwijsin/nuxt-newsletter-signup`](https://github.com/onderwijsin/nuxt-modules/tree/main/modules/newsletter-signup)
for a browser-safe signup form. Its server endpoint keeps the Loops API key private and can create
the contact and apply a configured mailing list. After the Directus user exists, set the configured
sync field to `true` if later profile updates should be mirrored.

The bundle does not subscribe users merely because their sync flag is enabled.

### Campaign archive rendering

`loops_ast` is the parsed, validated AST produced from the Loops email message. In a Nuxt frontend,
install
[`@onderwijsin/nuxt-loops-renderer`](https://github.com/onderwijsin/nuxt-modules/tree/main/modules/loops-renderer)
and pass the AST and merge-tag variables to its auto-imported component:

```vue
<script setup lang="ts">
import type { LoopsLmxVariables } from '@onderwijsin/loops-core'

const campaign = await getCampaign()
const variables: LoopsLmxVariables = { contact: {}, event: {}, data: {} }
</script>

<template>
  <LoopsRenderer v-if="campaign.loops_ast" :data="campaign.loops_ast" :variables="variables" />
</template>
```

The renderer is the presentation layer. It does not call the Loops API or parse raw LMX. Keep raw
LMX and API keys on the server, and expose only the fields needed by the current archive view.

## Runtime behavior and errors

- Requests with no Loops webhook headers pass through so unrelated Directus webhook Flows continue
  to work.
- Partial headers, invalid signatures, expired timestamps, invalid JSON, and invalid webhook
  payloads are rejected through Directus's error pipeline.
- A valid but non-allowlisted event returns an ignored result and is not archived.
- A campaign API or LMX failure marks the campaign `failed`, stores a bounded diagnostic, and lets
  the Flow report the failure. `best_effort` may produce `partial` when parser diagnostics exist.
- Profile synchronization is best effort. A failed Loops contact update is logged and does not roll
  back the completed Directus user mutation.
- No application-level retries are added for contact updates because they are mutations.

## Security and troubleshooting

Run the bundle only in a trusted, non-sandboxed Directus runtime. Use HTTPS for webhook delivery,
restrict the management policy to trusted operators, and rotate the Loops signing secret in both
systems together.

If verification fails, check the Flow trigger URL, matching signing secret, webhook headers, and
server clock tolerance. If campaigns remain `failed`, check `LOOPS_API_KEY`, outbound access,
matching campaign/email-message IDs, `ingestion_error`, and the Directus logs. If provisioning is
absent, check `LOOPS_ENABLED`, `LOOPS_SCHEMA_CHANGES_ENABLED`, both global provisioning gates, and
any custom names.

This bundle does not own signup. Configure `@onderwijsin/nuxt-newsletter-signup` or implement a
trusted server-side Loops API integration separately.

## Compatibility

- Directus `^12.2.0`
- Node.js `>=24.10.0`
- Trusted, non-sandboxed Directus runtime

## License

## Studio Docs

The bundle seeds the `Loops` article from `docs/loops.json` when Studio Docs and data seeding are
enabled. Set `LOOPS_DOCS_SEED_ENABLED=false` to opt out.

The bundled documentation is available in Dutch. To translate it, keep the seeding strategy on
`versioning`, start the extension with seeding enabled, edit and publish your translation on the
main article, and reject incoming updates. Create a fresh translation from the Dutch source when the
documentation changes.

MIT
