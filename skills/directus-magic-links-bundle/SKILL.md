---
name: directus-magic-links-bundle
description: Set up and operate the Directus magic-links authentication bundle.
---

# Directus Magic Links

This skill is the operator-facing setup reference. The bundle validates its shared and
entrypoint-specific environment configuration, ensures its portable schema at Directus startup, and
provides public request and redemption endpoints, plus optional scheduled cleanup for old records.

## Configuration

Configure shared values for both entries. Schema-change and cleanup values are hook-only; token,
redirect, and email values are endpoint-only. `MAGIC_LINKS_REDIRECT_URL_ALLOWLIST` is required by
the endpoint.

| Variable                                     | Default                    | Accepted values / purpose                          |
| -------------------------------------------- | -------------------------- | -------------------------------------------------- |
| `MAGIC_LINKS_ENABLED`                        | `true`                     | Boolean; disables both entries when `false`.       |
| `DIRECTUS_EXTENSIONS_SCHEMA_CHANGES_ENABLED` | `true`                     | Boolean global schema switch.                      |
| `MAGIC_LINKS_SCHEMA_CHANGES_ENABLED`         | `true`                     | Boolean bundle schema switch.                      |
| `MAGIC_LINKS_SCHEMA_ABORT_ON_ERROR`          | `true`                     | Boolean setup failure policy.                      |
| `DIRECTUS_EXTENSIONS_LOCK_PROVIDER`          | `MEMORY`                   | `MEMORY`, `REDIS`, or `FS` schema lock provider.   |
| `DIRECTUS_EXTENSIONS_LOCK_REDIS_URL`         | unset                      | Required when the provider is `REDIS`.             |
| `DIRECTUS_EXTENSIONS_LOCK_FS_DIRECTORY`      | unset                      | Required when the provider is `FS`.                |
| `MAGIC_LINKS_TOKEN_SECRET`                   | Directus `SECRET` fallback | Non-empty HMAC secret.                             |
| `MAGIC_LINKS_TOKEN_TTL`                      | `15m`                      | Duration such as `30m` or `7d`.                    |
| `MAGIC_LINKS_REDIRECT_URL_ALLOWLIST`         | required                   | Non-empty array of valid redirect URLs.            |
| `MAGIC_LINKS_TOKEN_QUERY_PARAMETER`          | `token`                    | Token query parameter name.                        |
| `MAGIC_LINKS_COLLECTION`                     | `magic_links`              | Underscore-compatible collection name.             |
| `MAGIC_LINKS_EMAIL_TEMPLATE`                 | `magic-link`               | Template name using letters, numbers, `_`, or `-`. |
| `MAGIC_LINKS_EMAIL_SUBJECT`                  | unset                      | Optional non-empty email subject.                  |
| `MAGIC_LINKS_EMAIL_REPLY_TO`                 | unset                      | Optional reply-to email address.                   |
| `MAGIC_LINKS_EMAIL_SENDER`                   | unset                      | Optional sender passed to Directus MailService.    |
| `USE_MAGIC_LINK_CLEANUP`                     | `false`                    | Boolean scheduled-cleanup switch.                  |
| `MAGIC_LINK_CLEANUP_WINDOW`                  | `24h`                      | Duration retention grace period.                   |
| `MAGIC_LINK_CLEANUP_CRON`                    | `*/15 * * * *`             | Non-empty Directus cron expression.                |

Example Directus environment:

```dotenv
MAGIC_LINKS_ENABLED=true
MAGIC_LINKS_REDIRECT_URL_ALLOWLIST=array:https://app.example.com/auth/magic-link
MAGIC_LINKS_TOKEN_TTL=15m
USE_MAGIC_LINK_CLEANUP=true
MAGIC_LINK_CLEANUP_WINDOW=7d
MAGIC_LINK_CLEANUP_CRON=0 * * * *
```

The extension also requires Directus SMTP configuration: `EMAIL_TRANSPORT=smtp`, `EMAIL_SMTP_HOST`,
`EMAIL_SMTP_PORT`, and `EMAIL_FROM`. `EMAIL_SMTP_USER` and `EMAIL_SMTP_PASSWORD` are optional for
unauthenticated SMTP providers, but must be configured together when authentication is required. The
endpoint validates these Directus mail prerequisites before registering routes.

## Schema setup

With both schema switches enabled, the hook creates the hidden configured magic-links collection
(default: `magic_links`), its fields, and the relation to `directus_users`. Compatible existing
resources are preserved. Incompatible structural resources are logged loudly and left unchanged.
Unexpected schema service failures abort setup by default; set
`MAGIC_LINKS_SCHEMA_ABORT_ON_ERROR=false` to log the failure and continue the hook setup. Schema
setup always uses the configured lock provider; use `REDIS` or `FS` when multiple Directus processes
share the same project.

The related user's current `email` is the authoritative delivery address. The magic-links table does
not duplicate an email snapshot.

## Scheduled cleanup

Set `USE_MAGIC_LINK_CLEANUP=true` to enable the hook schedule. Every run deletes records when either
`expires_at` or `redeemed_at` is older than `MAGIC_LINK_CLEANUP_WINDOW` (24 hours by default). For
example, a link expiring at 10:00 with a `24h` window becomes eligible after 10:00 the next day;
pending, unexpired links are not deleted.

The schedule is registered only when both `MAGIC_LINKS_ENABLED` and `USE_MAGIC_LINK_CLEANUP` are
enabled. The delete runs in a database transaction and logs the number of removed records. Cleanup
failures are logged and do not interrupt the Directus process or authentication endpoints. In a
multi-instance deployment, each Directus process may run the schedule; concurrent runs are safe and
idempotent, but coordinate scheduling externally if duplicate executions are undesirable. Keep this
disabled if retention is managed outside the bundle.

The portable schema data is exported as `@onderwijsin/directus-magic-links-bundle/schema` for manual
inspection or application when automated schema changes are disabled.

## API surface

The endpoint base path is `/auth/magic-links`.

### `POST /auth/magic-links/request`

Request body:

```json
{
  "email": "user@example.com",
  "redirectUrl": "https://app.example.com/auth/magic-link"
}
```

The email is trimmed and lowercased for lookup. The redirect must exactly match an entry in
`MAGIC_LINKS_REDIRECT_URL_ALLOWLIST`; credentials, unexpected ports, unsupported schemes, and
unconfigured paths are rejected with Directus `InvalidPayloadError`.

The endpoint returns `202` and this same response for both known and unknown addresses:

```json
{
  "message": "If an account exists for this email address, a sign-in link has been sent."
}
```

Only active users using the default local provider receive mail. The link token is generated with
256 bits of cryptographic entropy, digested with HMAC-SHA-256, and stored only as `token_hash`.
Records begin with `email_status=pending` and become `sent` or `error`; delivery failures do not
change the generic response. Requests do not revoke earlier links.

### `POST /auth/magic-links/redeem`

Request body:

```json
{
  "token": "raw-token-from-email",
  "otp": "123456",
  "mode": "json"
}
```

`token` is required. `otp` is required for users with a configured personal TFA secret. `mode`
defaults to `json` and accepts `json`, `cookie`, or `session`. The token is digested and checked
transactionally with a row lock; it must be unexpired, unredeemed, active, and linked to the default
local provider.

Modes mirror Directus login. `json` returns access and refresh tokens in JSON. `cookie` returns the
access token in JSON and sets the refresh token in an HttpOnly cookie. `session` sets the stateful
session token in an HttpOnly cookie and returns the expiry metadata. Cookie names, TTL, domain,
`Secure`, and `SameSite` settings use Directus's `REFRESH_TOKEN_COOKIE_*` and `SESSION_COOKIE_*`
configuration.

On success, the bundle validates a configured personal TFA secret, creates a short-lived bootstrap
session, and calls Directus `AuthenticationService.refresh()` to create the normal authentication
result before marking the link redeemed in the same transaction. Invalid, expired, already redeemed,
inactive, unsupported-provider requests return Directus's generic credentials error. Missing or
invalid OTP requests return Directus's `InvalidOtpError`; the transaction rolls back and leaves the
link available for an OTP retry.

Known limitation: magic-link redemption does not currently preserve Directus's policy-based TFA
setup claim. A user whose role requires TFA through `enforce_tfa`, but who has not finished setting
up a personal TFA secret, can receive a normal authenticated session instead of the required TFA
setup state. Users with a configured TFA secret are still required to provide a valid OTP. Track the
investigation and proposed follow-up in
[the GitHub issue](https://github.com/onderwijsin/directus-extensions/issues/20).

Invalid OTP attempts during redemption also do not inherit Directus's login-attempt limiter.
Redemption verifies OTP directly and then calls `AuthenticationService.refresh()`, while Directus
does not expose its internal authentication-attempt limiter as a reusable extension API. The link
therefore remains retryable after an invalid OTP until expiry or successful redemption. Apply rate
limiting to both public routes at the edge or API gateway. A distributed redemption limiter backed
by `createKv` is backlog work tracked in
[the GitHub issue](https://github.com/onderwijsin/directus-extensions/issues/21).

The endpoint accepts public requests, but the configured magic-links collection remains private. Do
not grant public CRUD permissions to that collection. Configure CORS and CSRF protections according
to the frontend's deployment and the selected cookie/session mode.

## Email template

Copy `templates/magic-link.liquid` into `EMAIL_TEMPLATES_PATH` and retain the configured template
name (`magic-link` by default). The template receives `url`, `email`, `expires_at`, `issued_at`,
`ip`, and `user_agent`, alongside Directus project variables. Configure `EMAIL_FROM` and SMTP before
testing delivery. Never add the raw token to logs or operational telemetry.

## Limitations and operations

- Rate limiting is a deployment responsibility and should be applied to the public request route.
- Scheduled cleanup is opt-in; when disabled, expired and redeemed records remain until an external
  retention process removes them.
- Rotating `MAGIC_LINKS_TOKEN_SECRET` or the Directus `SECRET` fallback invalidates existing links.
- The bundle does not replace or modify Data Studio login.
- Policy-enforced users who have not completed personal TFA setup are not currently placed into
  Directus's required TFA setup state when they redeem a magic link.
- The bundle requires a trusted, non-sandboxed Directus runtime.
- Keep the `magic_links` collection private; configure CORS and CSRF protections for the selected
  cookie or session mode.

See
[`Magic-link architecture and security boundaries`](../../docs/decisions/magic-links-architecture-and-security-boundaries.md)
for the design rationale and explicit security boundaries.
