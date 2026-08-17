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
- [Directus authentication service](https://raw.githubusercontent.com/directus/directus/main/api/src/services/authentication.ts)

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
7. Send the email using Directus `MailService`.
8. Return the generic response without revealing account existence.

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

The first redemption request may omit `otp`. If the token is valid but the user requires TFA, the
endpoint returns a `401` response with a stable machine-readable code such as `MFA_REQUIRED` and no
session:

```json
{
  "errors": [
    {
      "message": "A second authentication factor is required.",
      "extensions": {
        "code": "MFA_REQUIRED"
      }
    }
  ]
}
```

The token remains unredeemed. The frontend prompts for the OTP and repeats the request with the same
magic-link token and `otp`. A successful OTP verification creates the session and marks the link
redeemed.

Invalid OTP attempts must use Directus's existing authentication service so its configured login
attempt limits and TFA verification behavior are preserved. The extension must not implement a
second TFA algorithm or silently grant a session after email possession alone.

## Token security

### Generation

Generate 32 random bytes with the platform cryptographic random generator and encode them as
base64url. Do not use timestamps, UUIDs, email addresses, or predictable identifiers as tokens.

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
  const link = await transaction('directus_magic_links as magic_links')
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

  await transaction('directus_magic_links')
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

The default collection name is:

```text
directus_magic_links
```

The `directus_` prefix is used deliberately for this first version. Directus has many built-in
collections using that convention, but collection names should still be checked against the
installed Directus version. If the runtime rejects or reserves this name, the collection name must
become configurable before implementation is released.

Schema:

| Field         | Type          | Required | Notes                                           |
| ------------- | ------------- | -------: | ----------------------------------------------- |
| `id`          | UUID          |      yes | Primary key                                     |
| `user`        | UUID relation |      yes | Many magic links to one `directus_users` record |
| `token_hash`  | String(64)    |      yes | Unique and indexed; hidden from the Data Studio |
| `expires_at`  | Timestamp     |      yes | Indexed                                         |
| `issued_at`   | Timestamp     |      yes | Creation time                                   |
| `redeemed_at` | Timestamp     |       no | Set once; retained for audit and cleanup        |

Relation:

```text
directus_magic_links.user → directus_users.id
```

Recommended relation behavior is cascade deletion when the user is deleted. The collection should
have no public CRUD permissions. Extension internals use elevated access while returned sessions
retain the user's ordinary role and permissions.

## Email template

The template is named `magic-link` and is based on Directus's password-reset template. The extension
should provide an example template, but must not assume that a package file is automatically loaded
by Directus.

Directus loads custom templates from `EMAIL_TEMPLATES_PATH`, which defaults to `./templates`.
[Directus email template documentation](https://docs.directus.io/self-hosted/email-templates).

The package should ship an example at:

```text
templates/magic-link.liquid
```

Consumer installation should copy or mount this file into `EMAIL_TEMPLATES_PATH`. Consumers may
replace it with a custom template while retaining the same template name and variables.

Required template variables:

- `url`;
- `email`;
- `first_name`;
- `last_name`;
- `expires_at`;
- Directus project variables such as `projectName` and `projectLogo`.

The email must contain a button, a plain-text fallback URL, the expiration notice, and a warning
that the user can ignore the email if they did not request it.

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
  logger,
  definition: magicLinksSchema,
  options: {
    useLockedSchemaChange,
    abortOnError,
  },
})
```

The definition should describe collections, fields, and relations using typed Directus service
payloads. The utility should use `CollectionsService`, `FieldsService`, and `RelationsService`,
which are documented Directus services.

Behavior:

1. Check the global schema-change switch.
2. Check the extension-specific schema-change switch.
3. Acquire an optional shared schema-operation lock.
4. Reload the schema after lock acquisition.
5. Create missing collections, fields, and relations.
6. Preserve existing compatible resources.
7. Reject incompatible existing resources rather than silently altering them.
8. Log every change and every incompatibility.
9. Release the lock in `finally`.

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
DIRECTUS_EXTENSIONS_USE_LOCKED_SCHEMA_CHANGE=true
MAGIC_LINKS_USE_LOCKED_SCHEMA_CHANGE=true
```

The extension-specific value overrides the global default. The lock key must include the extension
ID and operation name, for example:

```text
directus-extension-schema:magic-links:ensure
```

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

Cleanup is optional and only runs through a scheduled/cron hook.

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

Cleanup should use the same shared lock family so multiple Directus replicas do not all perform the
same cleanup work when Redis coordination is available.

## Rate limiting

V1 should not implement a custom endpoint-specific rate limiter.

Current Directus behavior provides:

- global per-IP API rate limiting through `RATE_LIMITER_*`;
- optional global request rate limiting through `RATE_LIMITER_GLOBAL_*`;
- authentication login-attempt limiting through the Directus authentication service;
- an independent email queue limiter through `RATE_LIMITER_EMAIL_*`.

Directus's password-request endpoint does not have a dedicated password-request rate limiter. The
magic-link request endpoint should therefore rely on the same global API and email limiter behavior
instead of creating an extension-specific limiter. Consumers should enable and configure Directus
rate limiting in production.

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

| Variable                                       | Default                    | Purpose                                           |
| ---------------------------------------------- | -------------------------- | ------------------------------------------------- |
| `MAGIC_LINKS_ENABLED`                          | `true`                     | Enable endpoint behavior                          |
| `MAGIC_LINKS_SCHEMA_CHANGES_ENABLED`           | `true`                     | Enable this extension's schema setup              |
| `DIRECTUS_EXTENSIONS_SCHEMA_CHANGES_ENABLED`   | `true`                     | Global schema setup switch                        |
| `MAGIC_LINKS_SCHEMA_ABORT_ON_ERROR`            | `true`                     | Abort this extension's setup after schema failure |
| `DIRECTUS_EXTENSIONS_USE_LOCKED_SCHEMA_CHANGE` | `true`                     | Global schema lock default                        |
| `MAGIC_LINKS_USE_LOCKED_SCHEMA_CHANGE`         | inherited                  | Extension-specific lock override                  |
| `MAGIC_LINKS_TOKEN_SECRET`                     | Directus `SECRET` fallback | HMAC key for token digests                        |
| `MAGIC_LINKS_TOKEN_TTL`                        | `15m`                      | Token lifetime                                    |
| `MAGIC_LINKS_REDIRECT_URL_ALLOWLIST`           | required                   | Allowed frontend URLs                             |
| `MAGIC_LINKS_TOKEN_QUERY_PARAMETER`            | `token`                    | Query parameter name                              |
| `MAGIC_LINKS_COLLECTION`                       | `directus_magic_links`     | Collection name override if needed                |
| `MAGIC_LINKS_EMAIL_TEMPLATE`                   | `magic-link`               | Liquid template name                              |
| `MAGIC_LINKS_EMAIL_SUBJECT`                    | configurable               | Email subject                                     |
| `USE_MAGIC_LINK_CLEANUP`                       | `false`                    | Enable scheduled cleanup                          |
| `MAGIC_LINK_CLEANUP_WINDOW`                    | `24h`                      | Retention grace period                            |
| `MAGIC_LINK_CLEANUP_CRON`                      | `*/15 * * * *`             | Cleanup schedule                                  |

## Testing plan

### Unit tests

- token generation and HMAC digesting;
- secret fallback behavior;
- redirect allowlist validation;
- request/redeem schemas;
- cookie mode selection;
- TFA response mapping;
- schema-switch precedence;
- lock configuration;
- cleanup-window parsing.

### Directus integration/E2E tests

1. Start without the magic-link collection.
2. Verify collection, fields, and relation are created at startup.
3. Restart and verify no duplicates are created.
4. Verify `directus_magic_links` is accepted by the target Directus version.
5. Request a link and verify only the digest is stored.
6. Verify unknown-email requests are indistinguishable from known-email requests.
7. Redeem successfully and verify the returned token accesses permitted content.
8. Redeem a second time and verify failure.
9. Redeem concurrently and verify only one session is created.
10. Verify TFA users receive `MFA_REQUIRED`, then succeed with a valid OTP.
11. Verify invalid OTP attempts remain subject to Directus authentication limits.
12. Verify JSON, cookie, and session modes.
13. Verify optional scheduled cleanup and its retention window.
14. Verify schema lock behavior with multiple extension processes.

## V1 implementation boundary

V1 includes:

- active users using Directus's default local provider only;
- JSON sessions by default;
- optional Directus-compatible cookie/session modes;
- TFA follow-up through an optional OTP on the redeem endpoint;
- HMAC token digests using a dedicated secret or explicit Directus `SECRET` fallback;
- retained magic-link records with `redeemed_at`;
- Knex transactions and row locking;
- `directus_magic_links` as the default collection name;
- reusable idempotent schema utilities;
- configurable shared schema locking;
- optional scheduled cleanup;
- no custom endpoint-specific rate limiter;
- an example password-reset-derived Liquid template.

Out of scope for V1:

- Data Studio authentication changes;
- external authentication providers;
- automatic invalidation of previous links;
- custom per-email or per-IP rate limiting;
- cookie mode as the default;
- SMS or non-email credentials;
- automatic filesystem installation of the email template.
