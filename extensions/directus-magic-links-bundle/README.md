# @onderwijsin/directus-magic-links-bundle

Passwordless magic-link authentication for Directus frontend clients.

The request and redemption endpoints are implemented. Optional scheduled cleanup removes old expired
and redeemed records.

## Installation

Install the bundle into a Directus project:

```sh
pnpm add @onderwijsin/directus-magic-links-bundle
```

The bundle requires a trusted Directus runtime, configured SMTP settings for email delivery, and at
least one HTTPS redirect URL in `MAGIC_LINKS_REDIRECT_URL_ALLOWLIST`.

## Configuration

The endpoint and startup hook validate the shared environment configuration. Each entry also
validates only the settings it owns: schema-change and cleanup settings belong to the hook, while
token, redirect, and email settings belong to the endpoint. Directus casts values from `.env` before
the extension receives them; arrays therefore use Directus's array syntax.

| Variable                                     | Default                    | Description                                          |
| -------------------------------------------- | -------------------------- | ---------------------------------------------------- |
| `MAGIC_LINKS_ENABLED`                        | `true`                     | Enable the bundle entries.                           |
| `DIRECTUS_EXTENSIONS_SCHEMA_CHANGES_ENABLED` | `true`                     | Global schema-change switch.                         |
| `MAGIC_LINKS_SCHEMA_CHANGES_ENABLED`         | `true`                     | Enable this bundle's schema changes.                 |
| `MAGIC_LINKS_SCHEMA_ABORT_ON_ERROR`          | `true`                     | Abort bundle setup after an unexpected schema error. |
| `DIRECTUS_EXTENSIONS_LOCK_PROVIDER`          | `MEMORY`                   | Schema lock provider: `MEMORY`, `REDIS`, or `FS`.    |
| `DIRECTUS_EXTENSIONS_LOCK_REDIS_URL`         | unset                      | Required when the provider is `REDIS`.               |
| `DIRECTUS_EXTENSIONS_LOCK_FS_DIRECTORY`      | unset                      | Required when the provider is `FS`.                  |
| `MAGIC_LINKS_TOKEN_SECRET`                   | Directus `SECRET` fallback | HMAC secret for token digests.                       |
| `MAGIC_LINKS_TOKEN_TTL`                      | `15m`                      | Token lifetime (`ms`, `s`, `m`, `h`, `d`, or `w`).   |
| `MAGIC_LINKS_REDIRECT_URL_ALLOWLIST`         | required                   | Non-empty array of allowed redirect URLs.            |
| `MAGIC_LINKS_TOKEN_QUERY_PARAMETER`          | `token`                    | Query parameter used for the raw token.              |
| `MAGIC_LINKS_COLLECTION`                     | `magic_links`              | Magic-link collection name.                          |
| `MAGIC_LINKS_EMAIL_TEMPLATE`                 | `magic-link`               | Directus Liquid template name.                       |
| `MAGIC_LINKS_EMAIL_SUBJECT`                  | unset                      | Optional subject passed to the mail service.         |
| `MAGIC_LINKS_EMAIL_REPLY_TO`                 | unset                      | Optional reply-to email address.                     |
| `MAGIC_LINKS_EMAIL_SENDER`                   | unset                      | Optional sender passed to the mail service.          |
| `USE_MAGIC_LINK_CLEANUP`                     | `false`                    | Enable scheduled cleanup.                            |
| `MAGIC_LINK_CLEANUP_WINDOW`                  | `24h`                      | Retention grace period after expiry or redemption.   |
| `MAGIC_LINK_CLEANUP_CRON`                    | `*/15 * * * *`             | Directus schedule expression for cleanup.            |

Example:

```dotenv
MAGIC_LINKS_ENABLED=true
MAGIC_LINKS_REDIRECT_URL_ALLOWLIST=array:https://app.example.com/auth/magic-link
MAGIC_LINKS_TOKEN_TTL=15m
USE_MAGIC_LINK_CLEANUP=true
MAGIC_LINK_CLEANUP_WINDOW=7d
MAGIC_LINK_CLEANUP_CRON=0 * * * *
```

`EMAIL_TRANSPORT=smtp`, `EMAIL_SMTP_HOST`, `EMAIL_SMTP_PORT`, and `EMAIL_FROM` are required Directus
mail configuration prerequisites. `EMAIL_SMTP_USER` and `EMAIL_SMTP_PASSWORD` are optional, but must
be configured together when the SMTP provider requires authentication. The bundle validates these
values before registering its endpoint.

## Schema setup

When schema changes are enabled, the startup hook creates the configured `MAGIC_LINKS_COLLECTION`
collection (default: `magic_links`), fields, and relation from the package's exported schema data.
Existing compatible schema resources are preserved. Set
`DIRECTUS_EXTENSIONS_SCHEMA_CHANGES_ENABLED=false` to disable schema changes globally, or
`MAGIC_LINKS_SCHEMA_CHANGES_ENABLED=false` to disable only this bundle. Schema setup always uses a
lock; configure `DIRECTUS_EXTENSIONS_LOCK_PROVIDER` for multi-process deployments.

The magic-link record stores a required relation to `directus_users`; the related user's current
`email` is used for delivery and is not duplicated in the magic-links table.

## Scheduled cleanup

Set `USE_MAGIC_LINK_CLEANUP=true` to register the configured Directus schedule. Each run deletes
records whose `expires_at` or `redeemed_at` is older than `MAGIC_LINK_CLEANUP_WINDOW`; the default
retention window is 24 hours. For example, with `MAGIC_LINK_CLEANUP_WINDOW=24h`, a link that expired
at 10:00 is eligible for deletion after 10:00 the following day. A link is also eligible after its
`redeemed_at` timestamp has passed the same window. Pending, unexpired links are not deleted.

The schedule is registered by the hook entry only when `MAGIC_LINKS_ENABLED` and
`USE_MAGIC_LINK_CLEANUP` are both enabled. Cleanup runs in a database transaction and logs its
deleted count or failure without affecting request or redemption endpoints. In a multi-instance
deployment, each Directus process may run the schedule; concurrent cleanup runs are safe and
idempotent, but operators should coordinate scheduling if duplicate executions are undesirable.
Leave the feature disabled when another system owns retention for the configured magic-links
collection.

## Request endpoint

`POST /auth/magic-links/request` accepts:

```json
{
  "email": "user@example.com",
  "redirectUrl": "https://app.example.com/auth/magic-link"
}
```

The email is trimmed and lowercased for lookup. `redirectUrl` must exactly match the configured
allowlist; credentials, ports, unsupported schemes, and unconfigured paths are rejected. Invalid
payloads and redirects return a Directus `InvalidPayloadError`.

For valid requests the endpoint always returns `202`, regardless of whether an active local-provider
user exists:

```json
{
  "message": "If an account exists for this email address, a sign-in link has been sent."
}
```

The link uses a 256-bit random token. Only its HMAC-SHA-256 digest is stored in `token_hash`; raw
tokens are included only in the email URL and are never logged or persisted. Existing links remain
valid until expiry or redemption. Email delivery records transition from `pending` to `sent` or
`error` while the endpoint retains the generic response.

Copy [`templates/magic-link.liquid`](templates/magic-link.liquid) into the configured
`EMAIL_TEMPLATES_PATH` before enabling delivery. The repository's local and E2E Compose stacks mount
this bundle directory automatically at `/directus/templates`.

The template receives `url`, `email`, `expires_at`, `issued_at`, `ip`, and `user_agent`, alongside
Directus project variables. The included template renders a human-readable expiry, a clickable URL,
and a neutral request-metadata callout. Configure `EMAIL_FROM` and SMTP through Directus; the
optional `MAGIC_LINKS_EMAIL_REPLY_TO` and `MAGIC_LINKS_EMAIL_SENDER` values are passed to Directus's
`MailService`.

## Redeem endpoint

`POST /auth/magic-links/redeem` accepts:

```json
{
  "token": "raw-token-from-email",
  "otp": "123456",
  "mode": "json"
}
```

`token` is required. `otp` is required when the user has a configured personal TFA secret. `mode`
defaults to `json` and accepts `json`, `cookie`, or `session`. The token is HMAC-digested and
checked inside a transaction with a row lock. The link must be unexpired, unredeemed, active, and
associated with Directus's default local provider.

Session modes mirror Directus login: `json` returns access and refresh tokens, `cookie` returns the
access token and sets the refresh token in an HttpOnly cookie, and `session` sets the stateful
session token in an HttpOnly cookie. Cookie names, TTLs, domain, `Secure`, and `SameSite` settings
come from Directus's `REFRESH_TOKEN_COOKIE_*` and `SESSION_COOKIE_*` environment options.

Successful redemption validates a configured personal TFA secret, bootstraps a short-lived Directus
session, and uses `AuthenticationService.refresh()` to issue Directus's normal authentication result
before marking the link redeemed in the same transaction. For users without a personal TFA secret,
the access-token JWT preserves Directus's role-policy `enforce_tfa` claim, so consumers can route
the user into their TFA setup flow. This matches Directus 12.2 login behavior: only policies
attached to the user's directly assigned role are considered for this claim.

Invalid, expired, already redeemed, inactive, unsupported-provider, missing-OTP, and invalid-OTP
requests return Directus's `InvalidOtpError` or generic credentials error as appropriate. OTP
failures roll back the transaction, so the link can be retried with another OTP; other failed
authentication leaves the link unredeemed as well.

When `enforce_tfa` is `true`, decode the access-token JWT payload client-side and route the
authenticated user into the application's TFA setup flow. JWT decoding is only a UI/navigation hint;
the server remains authoritative for authentication and OTP validation. The JWT can be decoded
without the Directus signing secret, but must not be treated as trusted input for authorization.

Known limitation: invalid OTP attempts during magic-link redemption do not inherit Directus's normal
login-attempt limiter. Redemption verifies the OTP directly and then calls
`AuthenticationService.refresh()`; Directus does not expose its internal authentication-attempt
limiter as a reusable extension API. A valid link therefore remains retryable after an invalid OTP
until it expires or is successfully redeemed. Apply rate limiting to the redeem route at the edge or
API gateway in the meantime. A distributed, redemption-specific limiter backed by `createKv` is
tracked as backlog work in
[the GitHub issue](https://github.com/onderwijsin/directus-extensions/issues/21).

Clients should remove the token from the browser URL immediately after reading it, avoid analytics
and application logs containing the token, and follow Directus's normal rules for storing returned
refresh credentials. The endpoint does not modify Data Studio authentication.

The schema data is also available at:

```ts
import schema from '@onderwijsin/directus-magic-links-bundle/schema'
```

## Runtime boundaries

The bundle requires a trusted, non-sandboxed Directus runtime and a configured SMTP transport. It
does not modify the Directus Data Studio authentication flow. The endpoint accepts public request
and redeem calls, but the configured magic-links collection must remain private and must not be
exposed through public CRUD permissions.

Apply rate limiting to both public routes at the edge or API gateway, especially the redeem route
because invalid OTP attempts are not covered by Directus's login-attempt limiter. Configure CORS for
the frontend origin. Cookie and session modes require the deployment's normal CSRF protections
because the browser sends the refresh or session cookie automatically.

For the rationale and security boundaries behind these choices, see the repository decision record:
[`Magic-link architecture and security boundaries`](../../docs/decisions/magic-links-architecture-and-security-boundaries.md).
