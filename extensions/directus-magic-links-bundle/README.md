# @onderwijsin/directus-magic-links-bundle

Passwordless magic-link authentication for Directus frontend clients.

Optional scheduled cleanup removes old expired
and redeemed records.

> ⚠️ Magic links are only support for users with native auth provider. OAuth providers are not supported.

## Installation

Install the bundle into a Directus project:

```sh
pnpm add @onderwijsin/directus-magic-links-bundle
```

The bundle requires a configured Directus
[email transport](https://directus.com/docs/configuration/email) and at least one
redirect URL in `MAGIC_LINKS_REDIRECT_URL_ALLOWLIST`. Redirect URLs may include explicit ports, such
as `http://localhost:3000/auth/magic-link`; use HTTPS in production.

## Configuration

The endpoint and startup hook each validate the shared environment configuration. While some of the configuration options are specific to this bundle, it also relies on common directus configuration.

| Variable                                                       | Default                                            | Description                                                                       |
| -------------------------------------------------------------- | -------------------------------------------------- | --------------------------------------------------------------------------------- |
| `MAGIC_LINKS_ENABLED`                                          | `true`                                             | Enable the bundle entries.                                                        |
| `DIRECTUS_EXTENSIONS_SCHEMA_CHANGES_ENABLED`                   | `true`                                             | Global schema-change switch.                                                      |
| `MAGIC_LINKS_SCHEMA_CHANGES_ENABLED`                           | `true`                                             | Enable this bundle's schema changes.                                              |
| `MAGIC_LINKS_SCHEMA_ABORT_ON_ERROR`                            | `true`                                             | Abort bundle setup after an unexpected schema error.                              |
| `SYNCHRONIZATION_STORE`                                        | `memory`                                           | Global fallback for the lock and limiter stores.                                  |
| `DIRECTUS_EXTENSIONS_LOCK_PROVIDER`                            | unset                                              | Schema lock provider: `memory`, `redis`, or `fs`; otherwise uses synchronization. |
| `DIRECTUS_EXTENSIONS_LOCK_REDIS_URL`                           | unset                                              | Optional override; otherwise uses resolved Redis settings.                        |
| `DIRECTUS_EXTENSIONS_LOCK_FS_DIRECTORY`                        | unset                                              | Required when the provider is `fs`.                                               |
| `DIRECTUS_EXTENSIONS_RATE_LIMITER_STORE`                       | unset                                              | Request and failed-OTP limiter store; otherwise uses `SYNCHRONIZATION_STORE`.     |
| `REDIS_ENABLED`                                                | `false`                                            | Enables component-based Redis configuration.                                      |
| `REDIS`                                                        | Directus setting                                   | Complete URL; takes precedence over components.                                   |
| `REDIS_HOST`, `REDIS_PORT`, `REDIS_USERNAME`, `REDIS_PASSWORD` | unset                                              | Required together when building a URL.                                            |
| `MAGIC_LINKS_TOKEN_SECRET`                                     | Directus `SECRET` fallback                         | HMAC secret for token digests.                                                    |
| `MAGIC_LINKS_TOKEN_TTL`                                        | `15m`                                              | Token lifetime (`ms`, `s`, `m`, `h`, `d`, or `w`).                                |
| `MAGIC_LINKS_REQUEST_RATE_LIMIT`                               | `5`                                                | Requests per IP per 60 seconds for the request endpoint.                          |
| `MAGIC_LINKS_REDIRECT_URL_ALLOWLIST`                           | required                                           | Non-empty array of HTTP(S) URLs without credentials; explicit ports are allowed.  |
| `MAGIC_LINKS_TOKEN_QUERY_PARAMETER`                            | `token`                                            | Query parameter used for the raw token.                                           |
| `MAGIC_LINKS_COLLECTION`                                       | `magic_links`                                      | Magic-link collection name.                                                       |
| `MAGIC_LINKS_EMAIL_TEMPLATE`                                   | `magic-link`                                       | Directus Liquid template name.                                                    |
| `MAGIC_LINKS_EMAIL_SUBJECT`                                    | `Your sign-in link`                                | Optional email subject override.                                                  |
| `MAGIC_LINKS_EMAIL_PREVIEW_TEXT`                               | `Use this secure link to sign in to your account.` | Optional inbox preview-text override.                                             |
| `MAGIC_LINKS_EMAIL_REPLY_TO`                                   | unset                                              | Optional reply-to email address.                                                  |
| `MAGIC_LINKS_EMAIL_SENDER`                                     | unset                                              | Optional sender passed to the mail service.                                       |
| `USE_MAGIC_LINK_CLEANUP`                                       | `false`                                            | Enable scheduled cleanup.                                                         |
| `MAGIC_LINK_CLEANUP_WINDOW`                                    | `24h`                                              | Retention grace period after expiry or redemption.                                |
| `MAGIC_LINK_CLEANUP_CRON`                                      | `*/15 * * * *`                                     | Directus schedule expression for cleanup.                                         |

Example:

```dotenv
MAGIC_LINKS_ENABLED=true
MAGIC_LINKS_REDIRECT_URL_ALLOWLIST=array:https://app.example.com/auth/magic-link
MAGIC_LINKS_TOKEN_TTL=15m
MAGIC_LINKS_REQUEST_RATE_LIMIT=5
USE_MAGIC_LINK_CLEANUP=true
MAGIC_LINK_CLEANUP_WINDOW=7d
MAGIC_LINK_CLEANUP_CRON=0 * * * *
```

The bundle uses Directus's internal `MailService` and thus accepts all of Directus's email transports: `sendmail`, `smtp`, `mailgun`, and `ses`. SMTP requires
`EMAIL_SMTP_HOST`; its port, credentials, and other options are owned by Directus and the consumer.
Mailgun requires its API key and domain; SES requires its access key ID, secret access key, and
region. The bundle validates the selected transport before registering its endpoint.

## Schema setup

When schema changes are enabled, the startup hook creates the configured `MAGIC_LINKS_COLLECTION`
collection (default: `magic_links`), fields, and relation from the package's exported schema data.
Existing compatible schema resources are preserved. Set
`DIRECTUS_EXTENSIONS_SCHEMA_CHANGES_ENABLED=false` to disable schema changes globally, or
`MAGIC_LINKS_SCHEMA_CHANGES_ENABLED=false` to disable only this bundle. Schema setup always uses a
lock to prevent concurrent modifications; configure `DIRECTUS_EXTENSIONS_LOCK_PROVIDER` for multi-process deployments.

The magic-link record stores a required relation to `directus_users`; the related user's current
`email` is used for delivery and is not duplicated in the magic-links table.

## Scheduled cleanup

Set `USE_MAGIC_LINK_CLEANUP=true` to register the cleanup Cron job. Each run deletes
records whose `expires_at` or `redeemed_at` is older than `MAGIC_LINK_CLEANUP_WINDOW`; the default
retention window is 24 hours. For example, with `MAGIC_LINK_CLEANUP_WINDOW=24h`, a link that expired
at 10:00 is eligible for deletion after 10:00 the following day. A link is also eligible after its
`redeemed_at` timestamp has passed the same window. Pending, unexpired links are not deleted.

The schedule is registered by the hook entry only when `MAGIC_LINKS_ENABLED` and
`USE_MAGIC_LINK_CLEANUP` are both enabled. Cleanup runs in a database transaction and logs its
deleted count or failure without affecting request or redemption endpoints. In a multi-instance
deployment that uses a process local `SYNCHRONIZATION_STORE`, each Directus process may run the schedule; concurrent cleanup runs are safe and
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
allowlist; credentials, unsupported schemes, and unconfigured paths are rejected. HTTP URLs and
explicit ports are supported for local development, but production deployments should use HTTPS.
Invalid payloads and redirects return a Directus `InvalidPayloadError`.

For valid requests the endpoint always returns `202`, regardless of whether an active local-provider
user exists:

```json
{
  "message": "If an account exists for this email address, a sign-in link has been sent."
}
```

The link uses a 256-bit random token. Only its HMAC-SHA-256 digest is stored in `token_hash`; raw
tokens are included only in the email URL and are never logged or persisted. Existing links remain
valid until expiry or redemption. After the link transaction commits, email delivery starts in the
background so SMTP or other transport latency does not affect the generic response. Delivery records
transition from `pending` to `sent` or `error`, keeping failures auditable without changing the
response. This is deliberately fire-and-forget: a process shutdown can leave a record pending or
interrupt an in-flight delivery. Request another link when delivery fails.

Copy [`templates/magic-link.liquid`](templates/magic-link.liquid) into the configured
`EMAIL_TEMPLATES_PATH` before enabling delivery. The repository's local and E2E Compose stacks mount
this bundle directory automatically at `/directus/templates`.

The template receives `url`, `email`, `expires_at`, `issued_at`, `ip`, and `user_agent`, alongside
Directus project variables, plus `preview_text`. The included template renders the configured
preview text as hidden inbox preheader content, a human-readable expiry, a clickable URL, and a
neutral request-metadata callout. `MailService` accepts the subject, but does not have a separate
preview-text metadata field; preview text is rendered by the Liquid template. If you use a custom
template, render `{{ preview_text }}` near the start of the HTML body to preserve the preheader.
Configure `EMAIL_FROM` and SMTP through Directus; the optional `MAGIC_LINKS_EMAIL_REPLY_TO` and
`MAGIC_LINKS_EMAIL_SENDER` values are passed to Directus's `MailService`.

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
requests return Directus's `InvalidOtpError` or generic credentials error as appropriate. When
`auth_login_attempts` is configured, missing or invalid OTP attempts consume a per-link budget;
successful redemption clears that budget. The budget uses the same maximum as Directus login
attempts and expires with the configured magic-link lifetime. OTP failures roll back the
transaction, so the link can be retried until the budget is exhausted; other failed authentication
leaves the link unredeemed as well. Set `DIRECTUS_EXTENSIONS_RATE_LIMITER_STORE=redis` and configure
Directus's resolved Redis configuration for coordination across Directus replicas. A complete
`REDIS` URL takes precedence over component values; component configuration requires
`REDIS_ENABLED=true` (or `SYNCHRONIZATION_STORE=redis`) and all four Redis component variables.
`auth_login_attempts=null` disables this limiter.

When the per-link budget is exhausted, Directus returns its standard `HitRateLimitError` response
with HTTP status `429`; stop retrying that link and use a new link after expiry or the application's
normal sign-in flow.

When `enforce_tfa` is `true`, decode the access-token JWT payload client-side and route the
authenticated user into the application's TFA setup flow. JWT decoding is only a UI/navigation hint;
the server remains authoritative for authentication and OTP validation. The JWT can be decoded
without the Directus signing secret, but must not be treated as trusted input for authorization.

The redemption limiter is separate from Directus's account-suspension behavior: it bounds OTP
attempts per magic-link credential and does not suspend the user. Apply rate limiting to both public
routes at the edge or API gateway as an additional deployment control.

Clients should remove the token from the browser URL immediately after reading it, avoid analytics
and application logs containing the token, and follow Directus's normal rules for storing returned
refresh credentials. The endpoint does not modify Data Studio authentication.

The schema data is also available at:

```ts
import schema from '@onderwijsin/directus-magic-links-bundle/schema'
```

## Boundaries

This extension is non-sandboxed, so it does not carry the trust required for Directus Marketplace
distribution. Install it as an npm package in the Directus runtime. Its startup hook creates or
reconciles the configured magic-links collection, fields, and relation; it creates no roles or
policies and does not modify the Directus Data Studio authentication flow. The endpoint accepts
public request and redeem calls, but the configured magic-links collection must remain private and
must not be exposed through public CRUD permissions.

The request endpoint applies a separate per-IP limit of 5 requests per minute by default, configured
with `MAGIC_LINKS_REQUEST_RATE_LIMIT`. The redemption endpoint separately limits failed OTP attempts
per magic-link using `auth_login_attempts`; the two budgets do not affect each other. Apply
additional rate limiting to both public routes at the edge or API gateway, especially the redeem
route because invalid OTP attempts are not covered by Directus's login-attempt limiter. Configure
CORS for the frontend origin. Cookie and session modes require the deployment's normal CSRF
protections because the browser sends the refresh or session cookie automatically.

For the rationale and security boundaries behind these choices, see the repository decision record:
[`Magic-link architecture and security boundaries`](../../docs/decisions/magic-links-architecture-and-security-boundaries.md).
