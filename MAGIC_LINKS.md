# Magic Links Extension

First feature and implementation specification

Status: Draft

Proposed package: `@onderwijsin/directus-magic-links`

## Purpose

This extension adds passwordless authentication for frontend applications. It does not replace or
modify the Directus Data Studio authentication flow.

A magic link is a short-lived, single-use authentication credential delivered by email. The frontend
receives the link, extracts the token, submits it to Directus, and receives a normal Directus
authentication result.

Directus API extensions run inside the API process and can use Directus services and the database
context. The implementation should use Directus's `AuthenticationService` for session creation, not
reproduce JWT or session logic.

References:

- [Directus API endpoints](https://directus.com/docs/guides/extensions/api-extensions/endpoints)
- [Directus services](https://directus.io/docs/guides/extensions/api-extensions/services)
- [Directus extension hooks and error handling](https://directus.com/docs/guides/extensions/api-extensions/hooks)
- [Directus authentication service](https://raw.githubusercontent.com/directus/directus/main/api/src/services/authentication.ts)

## Error handling

All endpoint failures must use `@directus/errors`. Prefer the standard Directus error classes,
including `InvalidPayloadError`, `InvalidCredentialsError`, `ForbiddenError`, and
`ServiceUnavailableError`. If no standard error is suitable, define a narrowly scoped error with
`createError()`.

The extension must not return ad-hoc error JSON or invent client-facing error shapes. Directus
serializes thrown errors consistently for REST and SDK clients.

For TFA, the extension must call `AuthenticationService.login()` and rethrow its `InvalidOtpError`
unchanged. It must not translate it into a custom `MFA_REQUIRED` error. This ensures that the
magic-link flow has the identical status, message, and `extensions.code` as the normal Directus
login flow for the supported Directus version. The frontend consumer skill must instruct clients to
branch on the exact Directus error code returned by that version, not on a magic-link-specific code.

## Request flow

```text
Frontend -- request(email, redirectUrl) --> Directus
         <-- generic response and email ----------------

User clicks email link --> Frontend
Frontend -- redeem(token[, otp]) ----------> Directus
         <-- normal Directus session -------------------
```

## Endpoints

### `POST /auth/magic-links/request`

Request:

```json
{
  "email": "user@example.com",
  "redirectUrl": "https://app.example.com/auth/magic-link"
}
```

The request endpoint always returns the same generic result for existing and non-existing users:

```http
202 Accepted
```

```json
{
  "message": "If an account exists for this email address, a sign-in link has been sent."
}
```

The endpoint must:

1. Validate the body with Zod.
2. Normalize the email for lookup.
3. Validate `redirectUrl` against the configured allowlist.
4. Find an active user using Directus's default local provider only.
5. Generate a cryptographically secure token.
6. Store only its digest.
7. Store the user relation, IP, user agent, `email_status=pending`, and issuance metadata.
8. Resolve the delivery address from the related user's current `email` and send the email using
   Directus `MailService`.
9. Update the record to `email_status=sent` or `email_status=error`.
10. Return the generic response without revealing account existence.

Requests must not invalidate earlier links. Earlier links remain valid until they expire or are
redeemed.

### `POST /auth/magic-links/redeem`

Request:

```json
{
  "token": "raw-token-from-email",
  "otp": "123456",
  "mode": "json"
}
```

`otp` is optional for users without TFA. It is required when Directus reports that the user has TFA
enabled.

For JSON mode, a successful response mirrors Directus login:

```json
{
  "data": {
    "access_token": "...",
    "refresh_token": "...",
    "expires": 900000,
    "id": "user-id"
  }
}
```

For cookie and session modes, the endpoint mirrors Directus's cookie behavior and environment
settings as closely as the public extension API permits.

Invalid, expired, already redeemed, inactive, or unsupported-provider tokens return a generic
authentication error.

## TFA follow-up in V1

TFA is not bypassed.

The first redemption request may omit `otp`. If the token is valid but the user requires TFA,
`AuthenticationService.login()` throws Directus's normal `InvalidOtpError`. The extension rethrows
that error unchanged, so the response has the same status, message, and `extensions.code` as a
normal Directus login. The exact serialized error is version-dependent and must be covered by an
integration test against the supported Directus version.

The token remains unredeemed. The frontend prompts for the OTP and repeats the request with the same
magic-link token and `otp`. A successful OTP verification creates the session and marks the link
redeemed.

Invalid OTP attempts must use Directus's existing authentication service so its configured login
attempt limits and TFA verification behavior are preserved. The extension must not implement a
second TFA algorithm or silently grant a session after email possession alone.

## Token security

### Generation

Use the secure URL-safe random-string utility already used by the target Directus runtime. The
current Directus authentication implementation uses `nanoid` for session tokens; the extension
should use the supported Directus utility/adapter rather than duplicating random generation or using
`Math.random`. The adapter should generate at least 256 bits of entropy and be covered by a unit
test.

Do not use timestamps, UUIDs, email addresses, or predictable identifiers as tokens. If the target
Directus version does not expose a supported secure random-string utility to extensions, stop and
record that compatibility decision before adding a direct dependency or fallback.

### Digest at rest

Use a keyed digest:

```text
token_hash = HMAC-SHA-256(token_secret, raw_token)
```

Store the hexadecimal digest in `token_hash`. The raw token exists only in the request and email
URL.

The preferred secret is a dedicated `MAGIC_LINKS_TOKEN_SECRET`. If it is not configured, the
extension may fall back to Directus's `SECRET`, provided that this fallback is documented clearly.
Directus uses `SECRET` for signing and notes that it must be explicitly stable in production and
across horizontally scaled instances.
[Directus security configuration](https://directus.com/docs/configuration/security-limits).

Using the Directus secret is acceptable for a first version because it is already a high-value,
stable secret. Its trade-offs are:

- changing `SECRET` invalidates all outstanding magic links;
- the same secret protects more than one credential type;
- a dedicated secret gives independent rotation and blast-radius control.

The implementation should therefore support the dedicated secret and use Directus `SECRET` only as
an explicit fallback. A secret rotation strategy can later support a current and previous secret.

Do not rely on a Directus `password` field for this collection. Directus's password hashing behavior
is tied to user/service logic; a normal collection write is not a safe assumption for arbitrary
credential fields. Directus's Argon2-based `Hash` field type is another possible option, but HMAC is
more suitable here because the token is already generated with 256 bits of entropy and must be
looked up efficiently.

### Expiration and redemption

Default token lifetime:

```text
MAGIC_LINKS_TOKEN_TTL=15m
```

Redemption must be atomic. Use Knex, not raw SQL:

```ts
await database.transaction(async (transaction) => {
  const link = await transaction('magic_links as magic_links')
    .select(
      'magic_links.*',
      'users.email as user_email',
      'users.status as user_status',
      'users.provider as user_provider',
    )
    .join('directus_users as users', 'users.id', 'magic_links.user')
    .where({ token_hash: digest })
    .whereNull('redeemed_at')
    .where('expires_at', '>', transaction.fn.now())
    .forUpdate()
    .first()

  if (!link || link.user_status !== 'active' || link.user_provider !== DEFAULT_AUTH_PROVIDER) {
    throw invalidCredentialsError()
  }

  const sessionMode = mode ?? 'json'

  const authentication = new AuthenticationService({
    knex: transaction,
    schema,
    accountability,
  })

  const session = await authentication.login(
    DEFAULT_AUTH_PROVIDER,
    { email: link.user_email },
    {
      ...(otp ? { otp } : {}),
      session: sessionMode === 'session',
    },
  )

  await transaction('magic_links')
    .where({ id: link.id, redeemed_at: null })
    .update({ redeemed_at: transaction.fn.now() })

  return session
})
```

The actual lookup should obtain the user through a safe relation or join and must verify that the
user is still active and uses the local provider. The transaction must roll back if session creation
or redemption marking fails. `forUpdate()` prevents concurrent requests from creating two sessions
from one link.

## Collection and schema

The default collection name is configurable and defaults to:

```text
MAGIC_LINKS_COLLECTION=magic_links
```

The `directus_` prefix is used deliberately for this first version. Directus has many built-in
collections using that convention, so startup must verify that the configured name is available and
compatible with the installed Directus version. Consumers can override it if their version or
deployment reserves the default name.

Schema:

| Field          | Type          | Required | Notes                                             |
| -------------- | ------------- | -------: | ------------------------------------------------- |
| `id`           | UUID          |      yes | Primary key                                       |
| `user`         | UUID relation |      yes | Many links to one `directus_users` record         |
| `token_hash`   | String(64)    |      yes | Unique and indexed; hidden from the Data Studio   |
| `expires_at`   | Timestamp     |      yes | Indexed                                           |
| `issued_at`    | Timestamp     |      yes | Issuance time; indexed                            |
| `redeemed_at`  | Timestamp     |       no | Set once; retained for audit and cleanup          |
| `ip`           | String(45)    |       no | Request IP; hidden or read-only                   |
| `user_agent`   | Text          |       no | Request user agent; hidden or read-only           |
| `email_status` | String        |      yes | `pending`, `sent`, or `error`; indexed            |
| `email_error`  | Text          |       no | Sanitized operational error; never raw token data |

`email_status=pending` is useful because record creation and email delivery are separate side
effects. A crash or transport failure can therefore be observed without pretending that delivery
succeeded. V1 records the status but does not retry email delivery automatically.

Relation:

```text
magic_links.user → directus_users.id
```

Recommended relation behavior is cascade deletion when the user is deleted. The collection should be
hidden in its collection metadata and have no public CRUD permissions. Extension internals use
elevated access while returned sessions retain the user's ordinary role and permissions.

`token_hash` must have a unique index. `issued_at` should have an ordinary non-unique index. The
related user's current email is the authoritative delivery address; it is intentionally not
duplicated on the magic-link record.

The JSON schema data should also configure a usable administrative presentation if an administrator
chooses to reveal the hidden collection:

| Field          | Interface             | Display        | UI metadata                          |
| -------------- | --------------------- | -------------- | ------------------------------------ |
| `id`           | `input`               | raw value      | hidden, readonly                     |
| `user`         | `select-dropdown-m2o` | related values | readonly                             |
| `token_hash`   | `input`               | raw value      | hidden, readonly                     |
| `expires_at`   | `datetime`            | datetime       | readonly                             |
| `issued_at`    | `datetime`            | datetime       | readonly                             |
| `redeemed_at`  | `datetime`            | datetime       | readonly                             |
| `ip`           | `input`               | raw value      | readonly                             |
| `user_agent`   | `input-multiline`     | raw value      | readonly                             |
| `email_status` | `select-dropdown`     | raw value      | readonly; choices pending/sent/error |
| `email_error`  | `input-multiline`     | raw value      | hidden, readonly                     |

These interface and display identifiers are part of the JSON data contract and must be checked
against the supported Directus version during implementation. They are presentation metadata only;
they do not replace server-side access controls.

## Email template

The template is named `magic-link` and is based on Directus's password-reset template. The extension
should provide an example template, but must not assume that a package file is automatically loaded
by Directus.

Directus loads custom templates from `EMAIL_TEMPLATES_PATH`, which defaults to `./templates`.
[Directus email template documentation](https://docs.directus.io/self-hosted/email-templates).

The extension cannot provide or register an email template automatically. The package README and
both consumer-facing skills must provide a copy/pastable example based on Directus's password-reset
template and link to the
[dynamic email template tutorial](https://directus.com/docs/tutorials/extensions/use-dynamic-values-in-custom-email-templates).

Consumers must copy the example into `EMAIL_TEMPLATES_PATH` and may replace it with a custom
template while retaining the same template name and variables.

Required template variables:

- `url`;
- `email`;
- `first_name`;
- `last_name`;
- `expires_at`;
- Directus project variables such as `projectName` and `projectLogo`.

The email must contain a button, a plain-text fallback URL, the expiration notice, and a warning
that the user can ignore the email if they did not request it.

## Consumer-facing skills

The published extension must provide two installable skills:

```text
skills/directus-magic-links/SKILL.md
skills/directus-magic-links-frontend/SKILL.md
```

The regular `directus-magic-links` skill helps agents install and configure the extension in a
Directus project. It covers package installation, trusted runtime requirements, SMTP setup,
environment variables, schema setup switches, importing the portable JSON schema manually,
allowlisted redirect URLs, email-template copy/paste, permissions, cleanup scheduling, rate-limit
prerequisites, cookie modes, troubleshooting, and known limitations.

The `directus-magic-links-frontend` skill is specifically for frontend clients. It covers the
request and redeem API contracts, redirect URL handling, token removal from browser history, JSON
and cookie/session modes, TFA follow-up, exact Directus error handling, refresh-token storage, CORS
and CSRF considerations, and example client flows. It must not describe server-internal utilities as
frontend APIs.

Both skills must be synchronized with the package README and endpoint behavior. The frontend skill
must explicitly state that clients should inspect Directus's standardized error code and should not
depend on a custom `MFA_REQUIRED` code.

## Redirect URL security

`redirectUrl` must be checked against a consumer-configured allowlist:

```text
MAGIC_LINKS_REDIRECT_URL_ALLOWLIST=https://app.example.com/auth/magic-link,https://admin.example.com/auth/magic-link
```

Validation rules:

- HTTPS required outside development;
- exact origin and configured path matching;
- reject credentials, unexpected ports, protocol-relative URLs, and non-HTTP(S) schemes;
- normalize URLs before comparison;
- append the token using `URL.searchParams`, never string concatenation.

The frontend should remove the token from the browser URL immediately after reading it and avoid
logging or forwarding it to analytics services.

## Schema operation utility

Schema setup belongs in `@onderwijsin/directus-extension-utils/server` so future extensions can
reuse it.

Proposed API:

```ts
await ensureDirectusSchema({
  extensionId: 'magic-links',
  database,
  getSchema,
  services,
  logger,
  definition: magicLinksSchema,
  options: {
    abortOnError,
  },
})
```

`services` is the `services` object supplied by the Directus hook context. It provides the
`CollectionsService`, `FieldsService`, and `RelationsService` constructors used by the utility.

Schema definitions must not be inline TypeScript objects. They are portable JSON data files shipped
by the extension and included in package exports. The general repository pattern is:

```text
schema/
└── directus_magic_links.json
```

The JSON document contains `collections`, `fields`, and `relations` arrays using the corresponding
Directus service payload shapes. It includes the hidden collection metadata, field interfaces,
displays, readonly/hidden settings, choices for `email_status`, indexes, and relation metadata. The
extension imports the JSON data at runtime; consumers can also import it from the published package
when automated schema changes are disabled.

The package export should expose the data through a stable public subpath, for example:

```text
@onderwijsin/directus-magic-links/schema
```

The published artifact must include the JSON file and its package export. Source-file imports and
workspace-only paths are not part of the consumer contract.

The utility should use `CollectionsService`, `FieldsService`, and `RelationsService`, which are
documented Directus services. JSON data files are the general pattern for every future extension
that modifies schema.

Behavior:

1. Load the portable JSON schema definition.
2. Check the global schema-change switch.
3. Check the extension-specific schema-change switch.
4. Acquire an optional shared schema-operation lock.
5. Reload the schema after lock acquisition.
6. Create missing collections, fields, and relations.
7. Preserve existing compatible resources.
8. Log incompatible existing resources loudly and preserve them rather than silently altering them.
   Compatibility is structural only: collection identity, field identity/type, and relation
   endpoints are authoritative; presentation metadata is not overwritten.
9. Log every change and every incompatibility.
10. Release the lock in `finally`.

Schema setup runs from a Directus startup hook, not from a request handler. The endpoint should wait
for a shared readiness promise and return `503` while setup is incomplete.

### Schema switches

Global:

```text
DIRECTUS_EXTENSIONS_SCHEMA_CHANGES_ENABLED=true
```

Extension-specific:

```text
MAGIC_LINKS_SCHEMA_CHANGES_ENABLED=true
```

Precedence:

```text
global false → all extension schema changes disabled
global true + extension false → only magic-link schema changes disabled
both true → schema ensure runs
```

The extension enable switch remains separate:

```text
MAGIC_LINKS_ENABLED=true
```

### Shared schema lock

Add the lock now as a reusable utility. Proposed configuration:

```text
DIRECTUS_EXTENSIONS_LOCK_PROVIDER=MEMORY
```

The extension-specific value overrides the global default. Add this shared constant and helper to
`@onderwijsin/directus-extension-utils/server`:

```ts
export const DIRECTUS_EXTENSION_SCHEMA_LOCK = 'directus-extension-schema'

export function getSchemaLockName(name: string): string {
  return `${DIRECTUS_EXTENSION_SCHEMA_LOCK}:${name}`
}
```

`getSchemaLockName('magic-links')` returns:

```text
directus-extension-schema:magic-links
```

The `:ensure` suffix is unnecessary because the lock specifically coordinates schema changes. If
future schema operations need separate concurrency domains, add an explicit operation argument then
rather than baking `:ensure` into the first public helper.

The utility should use the repository's existing server lock providers. Redis is required for a lock
shared across multiple Directus replicas; a process-local lock is acceptable only as a fallback and
must produce a warning when used in a multi-instance deployment.

The lock is an optimization and coordination mechanism, not the correctness boundary. Schema
operations must remain idempotent and tolerate a concurrent create race wherever the database and
Directus services permit it.

### Startup failure policy

The default is:

```text
MAGIC_LINKS_SCHEMA_ABORT_ON_ERROR=true
```

On failure, the extension logs loudly and aborts its own setup. It does not terminate the entire
Directus process by default. Consumers may choose a stricter process-level startup policy in a
future option.

## Cleanup

Cleanup is optional and only runs through Directus's `schedule` hook. The extension registers the
configured cron expression with `schedule(cron, callback)` and does not create its own timer or
background worker.
[Directus schedule hooks](https://directus.com/docs/guides/extensions/api-extensions/hooks#schedule).

Configuration:

```text
USE_MAGIC_LINK_CLEANUP=false
MAGIC_LINK_CLEANUP_WINDOW=24h
MAGIC_LINK_CLEANUP_CRON=*/15 * * * *
```

When enabled, the scheduled task deletes records where:

```text
redeemed_at < now - cleanup window
OR
expires_at < now - cleanup window
```

The cleanup window is a retention grace period. Security does not depend on cleanup because
redemption always checks expiration and `redeemed_at`.

Cleanup should use the same shared schema/maintenance lock family so multiple Directus replicas do
not all perform the same cleanup work when Redis coordination is available.

## Rate limiting

V1 should mirror Directus's existing public-auth security model and must not implement a separate
extension-specific rate limiter.

Current Directus behavior provides:

- global per-IP API rate limiting through `RATE_LIMITER_*`;
- optional global request rate limiting through `RATE_LIMITER_GLOBAL_*`;
- authentication login-attempt limiting through the Directus authentication service;
- an independent email queue limiter through `RATE_LIMITER_EMAIL_*`.

Directus's password-request endpoint does not have a dedicated password-request rate limiter. The
magic-link request endpoint should therefore rely on the same global API limiter and Directus email
limiter behavior. Redemption should use `AuthenticationService.login()` so its authentication
attempt limiting and TFA behavior are inherited. If a future supported Directus version adds an
auth-specific limiter for the equivalent public endpoint, the extension should reuse that internal
mechanism rather than add its own policy. Consumers should enable and configure Directus rate
limiting in production.

## Email prerequisites

The consumer must configure a working SMTP transport before enabling the extension. V1 does not
support falling back to sendmail, Mailgun, or SES for magic-link delivery.

Required Directus configuration includes:

```text
EMAIL_TRANSPORT=smtp
EMAIL_SMTP_HOST=...
EMAIL_SMTP_PORT=...
EMAIL_SMTP_USER=...
EMAIL_SMTP_PASSWORD=...
EMAIL_FROM=no-reply@example.com
```

The extension should validate the required SMTP configuration during setup and throw a
`ServiceUnavailableError` or another appropriate standardized Directus error when it is missing.
Email transport failures set `email_status=error`, log the failure without token data, and return a
standardized service error according to the endpoint's generic-response contract.

References:

- [Directus security and limits](https://directus.com/docs/configuration/security-limits)
- [Directus rate limiter implementation](https://raw.githubusercontent.com/directus/directus/main/api/src/rate-limiter.ts)
- [Directus authentication service](https://raw.githubusercontent.com/directus/directus/main/api/src/services/authentication.ts)

## Session modes and cookies

Default mode is JSON. The optional cookie modes should mirror Directus login:

| Mode      | Result                                                 |
| --------- | ------------------------------------------------------ |
| `json`    | Access and refresh tokens in JSON                      |
| `cookie`  | Access token in JSON; refresh token in HttpOnly cookie |
| `session` | Access/session token in HttpOnly session cookie        |

Cookie behavior must respect the relevant Directus environment variables for names, TTL, domain,
Secure, and SameSite settings. Cookie mode must be documented with its CSRF implications.

## Permissions and accountability

The request and redeem routes are public frontend routes, but the magic-link collection is private.
Internal reads and writes use elevated service access. The resulting session is created through
Directus authentication and receives the user's normal role, policy, admin, and app-access claims.

Request metadata should be passed into the authentication service where supported:

- IP;
- user agent;
- origin.

The extension must not grant admin access or alter Data Studio login behavior.

## Configuration summary

| Variable                                     | Default                    | Purpose                                           |
| -------------------------------------------- | -------------------------- | ------------------------------------------------- |
| `MAGIC_LINKS_ENABLED`                        | `true`                     | Enable endpoint behavior                          |
| `MAGIC_LINKS_SCHEMA_CHANGES_ENABLED`         | `true`                     | Enable this extension's schema setup              |
| `DIRECTUS_EXTENSIONS_SCHEMA_CHANGES_ENABLED` | `true`                     | Global schema setup switch                        |
| `MAGIC_LINKS_SCHEMA_ABORT_ON_ERROR`          | `true`                     | Abort this extension's setup after schema failure |
| `DIRECTUS_EXTENSIONS_LOCK_PROVIDER`          | `MEMORY`                   | Schema lock provider (`MEMORY`, `REDIS`, or `FS`) |
| `DIRECTUS_EXTENSIONS_LOCK_REDIS_URL`         | unset                      | Required when the provider is `REDIS`             |
| `DIRECTUS_EXTENSIONS_LOCK_FS_DIRECTORY`      | unset                      | Required when the provider is `FS`                |
| `MAGIC_LINKS_TOKEN_SECRET`                   | Directus `SECRET` fallback | HMAC key for token digests                        |
| `MAGIC_LINKS_TOKEN_TTL`                      | `15m`                      | Token lifetime                                    |
| `MAGIC_LINKS_REDIRECT_URL_ALLOWLIST`         | required                   | Allowed frontend URLs                             |
| `MAGIC_LINKS_TOKEN_QUERY_PARAMETER`          | `token`                    | Query parameter name                              |
| `MAGIC_LINKS_COLLECTION`                     | `magic_links`              | Collection name override if needed                |
| `MAGIC_LINKS_EMAIL_TEMPLATE`                 | `magic-link`               | Liquid template name                              |
| `MAGIC_LINKS_EMAIL_SUBJECT`                  | configurable               | Email subject                                     |
| `EMAIL_TRANSPORT`                            | required `smtp`            | Required Directus email transport                 |
| `EMAIL_SMTP_HOST`                            | required                   | SMTP host                                         |
| `EMAIL_SMTP_PORT`                            | required                   | SMTP port                                         |
| `EMAIL_SMTP_USER`                            | required                   | SMTP username                                     |
| `EMAIL_SMTP_PASSWORD`                        | required                   | SMTP password                                     |
| `EMAIL_FROM`                                 | required                   | Sender address                                    |
| `USE_MAGIC_LINK_CLEANUP`                     | `false`                    | Enable scheduled cleanup                          |
| `MAGIC_LINK_CLEANUP_WINDOW`                  | `24h`                      | Retention grace period                            |
| `MAGIC_LINK_CLEANUP_CRON`                    | `*/15 * * * *`             | Cleanup schedule                                  |

## Testing plan

### Unit tests

- token generation through the supported Directus secure random utility;
- standardized Directus error propagation, including exact `InvalidOtpError` behavior;
- token generation and HMAC digesting;
- secret fallback behavior;
- redirect allowlist validation;
- request/redeem schemas;
- cookie mode selection;
- TFA response mapping;
- JSON schema data loading and package-export compatibility;
- schema-switch precedence;
- lock configuration;
- cleanup-window parsing.

### Directus integration/E2E tests

1. Start without the magic-link collection.
2. Verify collection, fields, and relation are created at startup.
3. Restart and verify no duplicates are created.
4. Verify `magic_links` is accepted by the target Directus version.
5. Request a link and verify only the digest is stored.
6. Verify unknown-email requests are indistinguishable from known-email requests.
7. Redeem successfully and verify the returned token accesses permitted content.
8. Redeem a second time and verify failure.
9. Redeem concurrently and verify only one session is created.
10. Verify TFA users receive the exact same `InvalidOtpError` response as normal Directus login,
    then succeed with a valid OTP.
11. Verify invalid OTP attempts remain subject to Directus authentication limits.
12. Verify JSON, cookie, and session modes.
13. Verify pending, sent, and error email statuses.
14. Verify optional scheduled cleanup and its retention window.
15. Verify schema lock behavior with multiple extension processes.

## V1 implementation boundary

V1 includes:

- active users using Directus's default local provider only;
- JSON sessions by default;
- optional Directus-compatible cookie/session modes;
- TFA follow-up through an optional OTP on the redeem endpoint;
- HMAC token digests using a dedicated secret or explicit Directus `SECRET` fallback;
- retained magic-link records with `redeemed_at`;
- Knex transactions and row locking;
- `magic_links` as the default collection name;
- reusable idempotent schema utilities;
- configurable shared schema locking;
- optional scheduled cleanup through the Directus schedule hook;
- Directus-aligned public-auth rate limiting with no custom endpoint-specific limiter;
- a copy/pastable password-reset-derived Liquid template example;
- two consumer-facing skills, one for Directus operators and one for frontend clients;
- portable JSON schema data included in package exports;
- standardized `@directus/errors` handling.

Out of scope for V1:

- Data Studio authentication changes;
- external authentication providers;
- automatic invalidation of previous links;
- custom per-email or per-IP rate limiting;
- cookie mode as the default;
- SMS or non-email credentials;
- automatic filesystem installation or registration of the email template;
- non-SMTP email transports.
