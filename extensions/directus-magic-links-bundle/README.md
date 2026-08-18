# @onderwijsin/directus-magic-links-bundle

Passwordless magic-link authentication for Directus frontend clients.

The request and redemption endpoints are implemented. Scheduled cleanup remains planned work.

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

| Variable                                       | Default                    | Description                                          |
| ---------------------------------------------- | -------------------------- | ---------------------------------------------------- |
| `MAGIC_LINKS_ENABLED`                          | `true`                     | Enable the bundle entries.                           |
| `DIRECTUS_EXTENSIONS_SCHEMA_CHANGES_ENABLED`   | `true`                     | Global schema-change switch.                         |
| `MAGIC_LINKS_SCHEMA_CHANGES_ENABLED`           | `true`                     | Enable this bundle's schema changes.                 |
| `MAGIC_LINKS_SCHEMA_ABORT_ON_ERROR`            | `true`                     | Abort bundle setup after an unexpected schema error. |
| `DIRECTUS_EXTENSIONS_USE_LOCKED_SCHEMA_CHANGE` | `true`                     | Default shared schema lock switch.                   |
| `MAGIC_LINKS_USE_LOCKED_SCHEMA_CHANGE`         | unset                      | Override the shared lock switch for this bundle.     |
| `MAGIC_LINKS_TOKEN_SECRET`                     | Directus `SECRET` fallback | HMAC secret for token digests.                       |
| `MAGIC_LINKS_TOKEN_TTL`                        | `15m`                      | Token lifetime (`ms`, `s`, `m`, `h`, `d`, or `w`).   |
| `MAGIC_LINKS_REDIRECT_URL_ALLOWLIST`           | required                   | Non-empty array of allowed redirect URLs.            |
| `MAGIC_LINKS_TOKEN_QUERY_PARAMETER`            | `token`                    | Query parameter used for the raw token.              |
| `MAGIC_LINKS_COLLECTION`                       | `magic_links`              | Magic-link collection name.                          |
| `MAGIC_LINKS_EMAIL_TEMPLATE`                   | `magic-link`               | Directus Liquid template name.                       |
| `MAGIC_LINKS_EMAIL_SUBJECT`                    | unset                      | Optional subject passed to the mail service.         |
| `MAGIC_LINKS_EMAIL_REPLY_TO`                   | unset                      | Optional reply-to email address.                     |
| `MAGIC_LINKS_EMAIL_SENDER`                     | unset                      | Optional sender passed to the mail service.          |
| `USE_MAGIC_LINK_CLEANUP`                       | `false`                    | Enable scheduled cleanup.                            |
| `MAGIC_LINK_CLEANUP_WINDOW`                    | `24h`                      | Retention grace period after expiry or redemption.   |
| `MAGIC_LINK_CLEANUP_CRON`                      | `*/15 * * * *`             | Directus schedule expression for cleanup.            |

Example:

```dotenv
MAGIC_LINKS_ENABLED=true
MAGIC_LINKS_REDIRECT_URL_ALLOWLIST=array:https://app.example.com/auth/magic-link
MAGIC_LINKS_TOKEN_TTL=15m
```

`EMAIL_TRANSPORT=smtp`, `EMAIL_SMTP_HOST`, `EMAIL_SMTP_PORT`, `EMAIL_SMTP_USER`,
`EMAIL_SMTP_PASSWORD`, and `EMAIL_FROM` remain Directus mail configuration prerequisites. They are
not extension-owned options.

## Schema setup

When schema changes are enabled, the startup hook creates the portable `magic_links` collection,
fields, and relation from the package's exported schema data. Existing compatible schema resources
are preserved. Set `DIRECTUS_EXTENSIONS_SCHEMA_CHANGES_ENABLED=false` to disable schema changes
globally, or `MAGIC_LINKS_SCHEMA_CHANGES_ENABLED=false` to disable only this bundle.

The magic-link record stores a required relation to `directus_users`; the related user's current
`email` is used for delivery and is not duplicated in the magic-links table.

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
`EMAIL_TEMPLATES_PATH` before enabling delivery.

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

`token` is required. `otp` is optional unless Directus requires TFA. `mode` defaults to `json` and
accepts `json`, `cookie`, or `session`. The token is HMAC-digested and checked inside a transaction
with a row lock. The link must be unexpired, unredeemed, active, and associated with Directus's
default local provider.

Session modes mirror Directus login: `json` returns access and refresh tokens, `cookie` returns the
access token and sets the refresh token in an HttpOnly cookie, and `session` sets the stateful
session token in an HttpOnly cookie. Cookie names, TTLs, domain, `Secure`, and `SameSite` settings
come from Directus's `REFRESH_TOKEN_COOKIE_*` and `SESSION_COOKIE_*` environment options.

Successful redemption authenticates through Directus's `AuthenticationService`, returns its normal
authentication result, and marks the link redeemed in the same transaction. Invalid, expired,
already redeemed, inactive, and unsupported-provider links return Directus's generic credentials
error. Authentication failures, including TFA failures, leave the link unredeemed; Directus's
standard TFA error is passed through unchanged.

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
and redeem calls, but the `magic_links` collection must remain private and must not be exposed
through public CRUD permissions.

Apply rate limiting to the request route at the edge or API gateway. Configure CORS for the frontend
origin. Cookie and session modes require the deployment's normal CSRF protections because the
browser sends the refresh or session cookie automatically.

For the rationale and security boundaries behind these choices, see the repository decision record:
[`Magic-link architecture and security boundaries`](../../docs/decisions/magic-links-architecture-and-security-boundaries.md).
