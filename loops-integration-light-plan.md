# Directus–Loops Integration: Light Version

## Background

Loops is the organization’s email marketing platform. It owns marketing contacts, mailing lists,
subscription preferences, campaign delivery, and the subscriber-facing preference experience.

Directus is the organization’s application data platform. It should optionally mirror selected
Directus user profile data into Loops and persist campaign content and campaign recipients for use
by applications such as Nuxt.

The initial integration concept grew toward a full subscription-management service: local
subscription records, list discovery, bidirectional list membership, local consent state, property
registries, reconciliation runs, and administrative subscription policies. That model creates
conflicting ownership between Directus and Loops.

The light version establishes a narrower boundary:

> Loops owns the marketing contract. Directus optionally mirrors user profile data and owns the
> campaign archive.

This preserves the organization’s existing Loops newsletter-signup package, which creates and
subscribes contacts directly through Loops, while keeping Directus useful as the application and
campaign-archive API layer.

## Goals

- Persist sent Loops campaign data in Directus.
- Persist the users who received each campaign.
- Verify and process signed Loops webhooks through Directus Flow infrastructure.
- Keep campaign ingestion idempotent and retryable.
- Optionally synchronize selected Directus user profile changes to Loops.
- Use the Directus user ID as the stable Loops contact `userId`.
- Keep Loops responsible for subscription state and list membership.
- Keep the existing newsletter-signup package working with direct Loops signup.
- Minimize schema, synchronization, and operational overhead.

## Non-goals

The light version does not provide:

- a `loops_subscriptions` collection;
- local subscription or global-unsubscribe state;
- local mailing-list membership management;
- a `loops_lists` collection or list synchronization;
- a subscription-management Studio interface;
- a subscribe proxy endpoint;
- a generic contact-property adapter;
- a `loops_sync_runs` collection;
- a webhook-ingestion collection;
- an external queue or outbox;
- initial synchronization of all existing Directus users;
- campaign delivery statistics, opens, clicks, or bounce reporting;
- a Directus or Vue email renderer;
- a custom campaign API endpoint.

Applications use the regular Directus API to retrieve campaign records. Nuxt or another frontend
remains responsible for rendering through the existing Loops renderer.

## Ownership model

### Directus owns

- Directus user identity;
- optional profile mirroring eligibility;
- campaign archive records;
- campaign recipient records;
- raw Loops campaign responses, raw LMX, and normalized LMX AST.

### Loops owns

- Loops contacts that originate through direct signup;
- marketing subscription state;
- global unsubscribe state;
- mailing-list membership;
- preference management;
- campaign sending and delivery.

Directus never attempts to reconstruct or locally own Loops subscription state in this version.

## User profile synchronization

### Opt-in field

Consumers add a Boolean field to `directus_users`:

```text
loops_sync_enabled
```

This field means:

> Synchronize this user’s future profile changes to Loops.

It does not mean that the user is subscribed to marketing, belongs to a list, or necessarily already
exists as a Loops contact.

### Supported profile fields

V1 synchronizes:

```text
email
first_name
last_name
```

Future fields may be added through configuration. No generic property registry or arbitrary field
adapter is required for this version.

### Update rules

The synchronization hook must follow these rules:

| Directus event                             | New `loops_sync_enabled` | Behavior                            |
| ------------------------------------------ | -----------------------: | ----------------------------------- |
| User created                               |             Either value | Do not call Loops.                  |
| User updated; name/email changed           |                   `true` | Create or update the Loops contact. |
| User updated; name/email changed           |                  `false` | Do nothing.                         |
| User updated; sync flag changes to `true`  |                   `true` | Create or update the Loops contact. |
| User updated; sync flag changes to `false` |                  `false` | Do nothing.                         |

| User updated; no relevant field changed | `true` or `false` | Do nothing. |

When Loops emits `contact.deleted` with a Directus `userId`, the webhook handler sets that user's
configured synchronization flag to `false`. This prevents a later eligible Directus profile update
from recreating the deleted Loops contact. Deletions without a Directus identity are acknowledged
without changing Directus data. `contact.unsubscribed` is not mapped to this flag because the flag
controls profile synchronization eligibility, not the Loops-owned marketing contract.

The important rule is that user creation is always ignored by the profile-sync hook. Enabling
`loops_sync_enabled` on an update is an explicit synchronization request and must call Loops, even
when the update contains no name or email change.

This supports the preferred signup flow without creating an intermediate contact:

```text
1. Create the Directus user with loops_sync_enabled = true.
2. Use the newsletter-signup package to create/update the Loops contact with the Directus user ID
   and selected list IDs.
```

Only two external API calls are required: one to Directus and one to Loops. The Directus create hook
does not create a contact before the newsletter signup has supplied list membership.

If an existing user is enabled later, the update event creates or updates the Loops contact without
changing any subscription or list state. Loops remains responsible for the marketing contract.

### Stable identity

The integration must send the Directus user ID to Loops as the contact `userId`. Profile updates
must address the Loops contact by this stable identifier rather than relying on email as the primary
key.

Email remains a historical value on campaign recipient records and may be used only as a fallback
when resolving older or externally created contacts.

### Direct signup contacts

Contacts created directly through the newsletter-signup package may not have a Directus user. This
is supported and expected. If a contact has no `userId`, campaign recipient resolution may leave the
Directus user relation empty while preserving the Loops contact ID and email snapshot.

## Data model

The light version has two integration collections. Directus standard system fields are omitted.

### `loops_campaigns`

One row represents one Loops campaign and its archived sent email message.

| Field                    | Type              | Contract                                                                  |
| ------------------------ | ----------------- | ------------------------------------------------------------------------- |
| `loops_campaign_id`      | String            | Required and unique.                                                      |
| `loops_email_message_id` | String            | Required and unique for the archived sent message.                        |
| `campaign_name`          | String            | Name from the Loops webhook.                                              |
| `subject`                | String            | Nullable while claimed; populated from the email-message API.             |
| `preview_text`           | Text              | Nullable while processing; preview text from Loops.                       |
| `from_name`              | String            | Nullable while processing; sender name.                                   |
| `from_email`             | String            | Nullable while processing; sender email address.                          |
| `reply_to_email`         | String            | Nullable while processing; reply-to address.                              |
| `cc_email`               | String            | Nullable.                                                                 |
| `bcc_email`              | String            | Nullable.                                                                 |
| `language_code`          | String            | Nullable and retained for forward compatibility.                          |
| `email_format`           | String/enum       | Nullable; expected values include `styled` and `plain`.                   |
| `raw_loops_response`     | JSON              | Nullable while processing; complete validated email-message response.     |
| `raw_lmx`                | Text              | Nullable while processing; original LMX document.                         |
| `loops_ast`              | JSON              | Nullable while processing; normalized AST from `loops-core`.              |
| `mailing_list_ids`       | JSON string array | List IDs associated with the campaign. No local list records are created. |
| `sent_at`                | DateTime          | Loops event/send time.                                                    |
| `loops_updated_at`       | DateTime          | Source message update time.                                               |
| `ingestion_status`       | Enum              | `processing`, `success`, `partial`, or `failed`.                          |
| `ingestion_error`        | Text              | Nullable bounded current error summary.                                   |
| `processing_started_at`  | DateTime          | Nullable processing lease timestamp.                                      |

The ingestion fields represent current materialized state, not an append-only audit trail. Flow logs
contain detailed processing history, and Directus revisions provide campaign item history.

Campaign content fields fetched from Loops are nullable while `ingestion_status` is `processing`.
The initial webhook request creates a minimal campaign claim before fetching and parsing the full
email message.

### `loops_campaign_recipients`

Loops sends `campaign.email.sent` events per contact. Each event produces one recipient record.

| Field              | Type                    | Contract                                                             |
| ------------------ | ----------------------- | -------------------------------------------------------------------- |
| `campaign`         | M2O → `loops_campaigns` | Required.                                                            |
| `directus_user`    | M2O → `directus_users`  | Nullable; resolved by Loops `contactIdentity.userId` when available. |
| `loops_contact_id` | String                  | Loops contact identity.                                              |
| `loops_email_id`   | String                  | Individual Loops email-send identity; used for idempotency.          |
| `email`            | String                  | Recipient email snapshot.                                            |
| `sent_at`          | DateTime                | Event time.                                                          |

The recipient row must retain the Loops contact ID and email even when `directus_user` resolves.
This preserves historical information if the user later changes email or the relationship changes.

The extension must enforce uniqueness on `loops_email_id`, or on the smallest composite key required
by the Loops API contract. Duplicate webhook delivery must not duplicate recipients.

## Campaign ingestion

### Flow integration

Consumers create a Directus webhook-triggered Flow and use the integration’s Loops webhook handler
operation. The default event allowlist contains:

```text
campaign.email.sent
```

The handler may later support other campaign and email event types, but subscription webhooks are
outside this version’s scope.

### Raw-body verification

Directus webhook Flow payloads expose the parsed request body, not the original request bytes. Loops
signature verification requires the exact raw body.

The extension therefore uses middleware before Flow execution to:

1. intercept the Flow trigger request;
2. capture the raw request body;
3. verify the Loops signature and timestamp tolerance;
4. mark the request as verified;
5. allow the Flow to continue with the parsed body.

The middleware must not interfere with unrelated webhook Flows. If safe classification is not
possible for a supported Directus version, consumers may configure the Flow ID or use the dedicated
verified endpoint fallback selected during implementation.

### Processing behavior

For each relevant webhook:

1. Validate the parsed webhook envelope with `loops-core` schemas.
2. Extract campaign and recipient identity.
3. Upsert or claim the campaign using the Loops campaign and email-message IDs.
4. Fetch the canonical email message from Loops.
5. Validate that the fetched message belongs to the expected campaign.
6. Persist raw Loops response and raw LMX.
7. Parse LMX into `loops_ast`.
8. Upsert the recipient using the individual Loops email-send ID.
9. Mark ingestion `success`, `partial`, or `failed`.

Multiple recipient events for one campaign must append recipient rows while reusing the campaign
archive. A later recipient event must not be ignored merely because the campaign content is already
stored.

### Concurrent campaign events

Campaign webhook events may arrive concurrently for thousands of recipients. The extension must use
the campaign row as a short-lived database claim rather than holding a database lock during network
requests or LMX parsing.

For every webhook:

1. Atomically insert a minimal campaign row with `ingestion_status = processing`.
2. If insertion succeeds, the request owns campaign fetching and parsing.
3. If insertion conflicts with an existing campaign, treat the conflict as an expected claim result,
   not as a webhook failure.
4. Insert the recipient independently and idempotently.
5. Only the claiming request fetches and persists the full campaign content.

The recipient insert must be independent of campaign-content processing. A request that observes an
active claim inserts its recipient and returns without waiting for the claimant. The recipient table
must enforce uniqueness on `loops_email_id` so duplicate delivery is a harmless no-op.

`processing_started_at` acts as a lease. If a campaign remains in `processing` beyond the configured
lease duration, a later webhook may reclaim it and retry campaign processing. Existing recipient
records must remain intact during a reclaim.

The implementation must not hold a database lock while calling the Loops API or parsing LMX.

### LMX failure behavior

Default behavior is best effort:

- always preserve raw Loops response and raw LMX;
- preserve successfully parsed AST nodes;
- mark the campaign `partial` when individual nodes fail;
- mark the campaign `failed` when no usable archive can be produced.

Strict versus best-effort parsing may be configurable through operation settings or environment
configuration.

## Newsletter signup integration

The existing newsletter-signup Nuxt package remains the marketing signup mechanism. It continues to
call Loops directly and passes the Directus user ID as `userId` when a Directus user exists.

The light integration does not add a Directus subscribe endpoint and does not require Directus to
know or synchronize mailing-list definitions. The newsletter frontend owns the configured list IDs
for each signup form.

The intended signup sequence is:

```text
Directus create user with loops_sync_enabled = true
        ↓
Newsletter package creates/updates Loops contact
and subscribes it to the selected list IDs
        ↓
Future Directus profile updates mirror to Loops
```

If the Loops signup fails after the Directus user is created, the user remains in Directus with sync
enabled and the signup can be retried. The profile-sync hook must not attempt to manage list
membership as part of that recovery.

## Configuration

The implementation must support configuration for:

- Loops API key;
- Loops webhook signing secret;
- webhook timestamp tolerance;
- campaign and recipient collection names;
- automatic schema-management enable/disable;
- automatic policy-management enable/disable;
- webhook event allowlist;
- LMX parsing mode;
- the `directus_users` sync-enabled field name;

Secrets must remain in Directus environment configuration and must never be stored in collection
records or Flow payloads.

## Permissions and policies

The light version needs only campaign/archive policies:

- view email campaigns;
- manage email campaigns;
- view campaign recipients;
- manage campaign archive data.

It must not provision subscription-management policies because subscription state is not represented
in Directus.

Consumers may disable automatic policy provisioning and define their own permissions.

## Failure handling and observability

- Invalid signatures fail before campaign side effects.
- Invalid webhook JSON or schema fails the Flow and remains retryable where appropriate.
- Unsupported valid events are acknowledged as ignored.
- Duplicate webhook delivery is harmless.
- Duplicate campaign-recipient delivery is harmless.
- Loops API failures fail the Flow and update campaign error state when a campaign exists.
- Stale campaign processing is reclaimable without deleting recipient records.
- Flow logs provide detailed webhook and synchronization history.
- No separate audit, ingestion-event, or synchronization-run collection is created.

## Testing requirements

V1 should test:

- raw-body signature verification and timestamp tolerance;
- middleware behavior for Loops and unrelated webhook Flows;
- malformed and unsupported webhook payloads;
- campaign creation and idempotent updates;
- concurrent campaign claims and independent recipient persistence;
- stale campaign claim recovery;
- multiple recipients for one campaign;
- duplicate recipient events;
- raw LMX and AST persistence;
- partial and failed LMX parsing;
- user creation with sync enabled not calling Loops;
- user update enabling sync calling Loops;
- enabled user name/email updates calling Loops;
- disabled user name/email updates not calling Loops;
- newsletter-created contacts remaining valid without a Directus subscription record;
- configurable collection names and schema-management opt-out;
- Directus E2E loading and observable Flow behavior.

## Open implementation questions

1. Can middleware safely classify Loops webhook Flow requests without affecting unrelated Flow
   triggers across all supported Directus versions?
2. If not, should consumers configure the Loops Flow ID, or should the extension provide a dedicated
   verified endpoint fallback?
3. Is `loops_email_id` globally unique, or does recipient uniqueness require a composite key?
4. Should Directus user profile synchronization be implemented as an action hook, an operation, or
   both?
5. What exact Directus field metadata should be used for the required `loops_sync_enabled` field?
6. Which Directus versions are supported by the first release?

## Summary

The light version consists of a campaign archive and optional profile mirroring. Loops remains the
owner of contacts’ marketing relationships, subscription state, and list membership. Directus stores
campaign content and recipient history, while selected Directus users can opt into future profile
synchronization through `loops_sync_enabled`.
