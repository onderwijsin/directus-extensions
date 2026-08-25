---
name: directus-loops-bundle
description: Set up and operate the Directus Loops archive and profile-sync bundle.
---

# @onderwijsin/directus-loops-bundle

Use this skill when installing or operating the Directus Loops bundle, wiring its webhook Flow,
debugging campaign ingestion, configuring profile synchronization, or integrating its archive with a
Nuxt application.

## Contract at a glance

The published bundle contains:

- `loops-webhook-hook`, a Directus hook for startup provisioning, signed webhook verification, and
  optional `directus_users` profile synchronization;
- `loops-webhook-handler`, a Directus Flow operation with no operation options; and
- the `loops_campaigns` and `loops_campaign_recipients` archive schemas plus two optional policies.

Loops owns contacts, consent, subscriptions, and mailing lists. The bundle does not expose a signup
endpoint, manage subscriptions, or expose an API key to browsers.

## Prerequisites

- Directus `^12.2.0`;
- Node.js `>=24.10.0`;
- a trusted, non-sandboxed Directus runtime;
- `LOOPS_API_KEY` for campaign ingestion or profile sync;
- `LOOPS_WEBHOOK_SIGNING_SECRET` for production webhook verification; and
- a public HTTPS Directus URL reachable by Loops.

## Installation and implementation steps

### 1. Install the published package

```sh
pnpm add @onderwijsin/directus-loops-bundle
```

Restart Directus. The bundle is discovered automatically; do not manually register its entries.

### 2. Add server environment variables

```dotenv
LOOPS_ENABLED=true
LOOPS_API_KEY=your_loops_api_key
LOOPS_WEBHOOK_SIGNING_SECRET=your_loops_webhook_signing_secret
```

Keep both values in the Directus server environment. Never put them in browser code or Nuxt public
runtime configuration.

### 3. Verify startup provisioning

The default startup behavior provisions:

- `loops_campaigns`;
- `loops_campaign_recipients`;
- `directus_users.loops_sync_enabled`; and
- `Can manage email campaigns` and `Can view email campaigns`.

The user field is omitted when `LOOPS_SYNC_ENABLED=false`. Campaign archive schema remains enabled
independently. Assign seeded policies to roles yourself; the bundle does not assign roles.

### 4. Create and publish the webhook Flow

In Directus:

1. Create a Flow with a **Webhook** trigger.
2. Add the **Loops Webhook Handler** operation (`loops-webhook-handler`).
3. Publish the Flow.
4. Copy its generated trigger URL, normally `https://directus.example.com/flows/trigger/<flow-id>`.

### 5. Add the Flow URL and signing secret in Loops

Follow the [Loops webhook setup guide](https://loops.so/docs/webhooks). In the Loops dashboard, open
**Settings → Webhooks** and paste the Directus Flow trigger URL into the endpoint field. Loops
provides the signing secret on this settings page; copy it into the Directus server environment as
`LOOPS_WEBHOOK_SIGNING_SECRET`. The value must match exactly.

Enable `campaign.email.sent` and `contact.deleted` in the Loops webhook event toggles. Loops
currently supports one webhook endpoint per account, so use this endpoint for all events handled by
the bundle.

The operation has no configurable options. It must receive the verified trigger data produced by the
bundle hook. It rejects arbitrary or unsigned calls.

### 6. Configure the Loops event set

The default allowlist is `campaign.email.sent,contact.deleted`. `campaign.email.sent` archives the
canonical email message and recipient. `contact.deleted` disables the matching Directus user's sync
flag when the webhook carries a Directus `userId`. Other events are acknowledged as ignored unless
added to the allowlist; adding an event does not add a handler for an unsupported event shape.

### 7. Enable profile sync per user (optional)

Set `directus_users.loops_sync_enabled` to `true` for users whose `email`, `first_name`, or
`last_name` changes should be sent to Loops. The Directus user ID is sent as Loops `userId`.

Creation is intentionally ignored. Use the separate Nuxt newsletter module to create a contact and
apply mailing-list membership during signup.

## Complete configuration reference

Blank optional secrets are treated as unset. Collection and field identifiers must match
`^[A-Za-z_][A-Za-z0-9_$]*$`.

| Variable                                      | Default                               | Accepted value / effect                                                                                        |
| --------------------------------------------- | ------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `LOOPS_ENABLED`                               | `true`                                | Boolean. Master switch; `false` registers nothing.                                                             |
| `LOOPS_SYNC_ENABLED`                          | `true`                                | Boolean. Adds the user field and profile-update hook. Campaign/webhook support remains available when `false`. |
| `LOOPS_API_KEY`                               | unset                                 | Non-empty secret. Required for campaign-message fetches and profile updates.                                   |
| `LOOPS_WEBHOOK_SIGNING_SECRET`                | unset                                 | Non-empty secret. Enables raw-body signature verification.                                                     |
| `LOOPS_WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS`   | `300`                                 | Non-negative integer. Maximum accepted webhook age.                                                            |
| `LOOPS_API_BASE_URL`                          | `https://app.loops.so`                | URL. Used as the Loops SDK API origin.                                                                         |
| `LOOPS_WEBHOOK_EVENT_ALLOWLIST`               | `campaign.email.sent,contact.deleted` | Non-empty string array. Events accepted for processing.                                                        |
| `LOOPS_CAMPAIGN_PROCESSING_LEASE_MS`          | `300000`                              | Positive integer. Stale campaign-claim recovery window.                                                        |
| `LOOPS_LMX_PARSING_MODE`                      | `best_effort`                         | `best_effort` stores partial content with diagnostics; `strict` fails on parser diagnostics.                   |
| `LOOPS_SYNC_ENABLED_FIELD`                    | `loops_sync_enabled`                  | Directus user field name.                                                                                      |
| `LOOPS_CAMPAIGNS_COLLECTION`                  | `loops_campaigns`                     | Campaign archive collection name.                                                                              |
| `LOOPS_CAMPAIGN_RECIPIENTS_COLLECTION`        | `loops_campaign_recipients`           | Recipient archive collection name.                                                                             |
| `LOOPS_SCHEMA_CHANGES_ENABLED`                | `true`                                | Boolean. Bundle schema/policy provisioning gate.                                                               |
| `LOOPS_SCHEMA_ABORT_ON_ERROR`                 | `true`                                | Boolean. Whether an unexpected provisioning error aborts startup.                                              |
| `LOOPS_MANAGE_EMAIL_CAMPAIGNS_POLICY_ENABLED` | `true`                                | Boolean. Seeds full campaign management policy.                                                                |
| `LOOPS_VIEW_EMAIL_CAMPAIGNS_POLICY_ENABLED`   | `true`                                | Boolean. Seeds restricted archive viewing policy.                                                              |
| `DIRECTUS_EXTENSIONS_SCHEMA_CHANGES_ENABLED`  | `true`                                | Global schema provisioning gate.                                                                               |
| `DIRECTUS_EXTENSIONS_DATA_SEED_ENABLED`       | `true`                                | Global policy/data provisioning gate.                                                                          |

When provisioning is disabled, create compatible schema and policies manually. Custom collection
names and the custom sync field must be configured before the Flow or hook uses them.

## Flow operation behavior

The operation validates the internal verification marker, the Loops webhook payload shape, and the
configured event allowlist. It returns `verified: true`, the webhook ID when available, and either
an ignored result or the event-specific result. A campaign result includes `campaignId`,
`recipientId`, and a status such as `processing`, `success`, `partial`, or `failed`.

For `campaign.email.sent`, it claims the campaign idempotently, persists the recipient send event,
fetches the email message from Loops, stores raw response and raw LMX, parses LMX into `loops_ast`,
and records processing status and bounded error diagnostics.

The canonical renderer fields are `subject`, `preview_text`, sender/reply-to fields, `email_format`,
`loops_ast`, and `sent_at`. Internal/raw fields should not be exposed to public readers.

## Policies and data access

The management policy grants full CRUD on campaigns and read access to recipients. The view policy
grants public campaign fields and recipient rows where `directus_user` equals the current user.
Review policies before assigning them; the bundle does not create roles or infer consent from the
sync field.

## Nuxt integration

### Signup: `@onderwijsin/nuxt-newsletter-signup`

Use the
[newsletter-signup module](https://github.com/onderwijsin/nuxt-modules/tree/main/modules/newsletter-signup)
for signup. Configure `provider: 'loops'`, its server-only `apiKey`, and `lists.default` or
`lists.options`. It exposes a server endpoint and `useNewsletterSignup()` while keeping credentials
off the client. This bundle remains responsible only for later Directus profile mirroring and
campaign archiving.

### Rendering: `@onderwijsin/nuxt-loops-renderer`

Use the
[loops-renderer module](https://github.com/onderwijsin/nuxt-modules/tree/main/modules/loops-renderer)
to render `loops_ast`:

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

The renderer validates the AST again at the browser boundary and does not parse raw LMX or call the
Loops API. Expose only the parsed AST and presentation data required by the current page.

## Operations and failure handling

- No Loops headers: pass through for unrelated webhook Flows.
- Partial headers, invalid signature, expired timestamp, invalid JSON, or invalid payload: reject.
- Non-allowlisted event: acknowledge as ignored.
- Loops API/LMX failure: mark campaign `failed`, persist bounded diagnostics, and report the Flow
  error.
- Parser diagnostics in `best_effort`: store `partial` content; in `strict`: fail ingestion.
- Profile update failure: log the failure without rolling back the Directus user update.
- Contact updates are not retried by the bundle because they are mutations.

## Troubleshooting checklist

### Verification fails

Check the Flow trigger URL, matching Loops/Directus secret, HTTPS reachability, webhook headers, and
server clock tolerance. Ensure the handler is downstream of the webhook trigger.

### Ingestion fails

Check `LOOPS_API_KEY`, API egress, matching campaign/email-message IDs, and `ingestion_error`.
Switch from strict to best-effort parsing only when partial content is an acceptable product choice.

### Provisioning is absent

Check `LOOPS_ENABLED`, `LOOPS_SCHEMA_CHANGES_ENABLED`, both `DIRECTUS_EXTENSIONS_*` gates, and
whether custom names already exist with compatible types.

### Signup is absent

This package intentionally does not provide signup. Configure the Nuxt newsletter-signup module or
implement a trusted server-side Loops API integration.

## Boundaries and compatibility

- Trusted, non-sandboxed Directus runtime only.
- Directus `^12.2.0` and Node.js `>=24.10.0`.
- API keys and webhook secrets are server-only.
- Loops remains authoritative for marketing relationships and mailing lists.
- This is a documentation-only update; no Changeset is required.
