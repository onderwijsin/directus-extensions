# Decision: Keep magic-link authentication transactional and Directus-native

- **Status:** Accepted
- **Date:** 2026-08-18
- **Scope:** `@onderwijsin/directus-magic-links-bundle`, its API endpoints, schema, email delivery,
  and consumer integration

## Context

Magic links introduce a passwordless authentication boundary between an untrusted browser, an email
transport, and the Directus authentication system. The design must prevent account enumeration and
token disclosure while still supporting Directus's existing authentication, two-factor
authentication, refresh-token, and session behavior.

The bundle also owns schema setup and email orchestration, but it must remain compatible with
Directus installations that already manage users, mail transport, cookies, and authentication
configuration.

## Decision

### Use a bundle with separate endpoint and hook entries

The published package is a Directus bundle containing an endpoint entry for
`POST /auth/magic-links/request` and `POST /auth/magic-links/redeem`, and a hook entry that applies
the portable `magic_links` schema and owns the optional cleanup job.

Endpoint registration stays thin. Boundary parsing, token operations, email delivery, redemption,
and session response mapping live in separately testable functions. Zod validates endpoint payloads
and environment-owned configuration at the boundary.

### Keep user identity in Directus and resolve the current email

Magic-link records relate to `directus_users` and do not duplicate an email snapshot. Requests
normalize the submitted email by trimming and lowercasing it, then resolve an active user using
Directus's default local provider. Delivery uses the user's current email address.

Only active users using the default local provider may receive or redeem a link. Data Studio login
is outside this extension's scope.

### Store only an HMAC digest of a cryptographically random token

Each request creates a 256-bit cryptographically random URL-safe token. The raw token is placed only
in the email URL. The database stores an HMAC-SHA-256 digest in `token_hash`, keyed by
`MAGIC_LINKS_TOKEN_SECRET` or the Directus `SECRET` fallback.

The raw token must not be stored, logged, added to telemetry, or included in database records. A
secret rotation intentionally invalidates existing links.

### Use exact redirect allowlisting

The request redirect must exactly match a configured entry in `MAGIC_LINKS_REDIRECT_URL_ALLOWLIST`.
Only HTTPS URLs without credentials or explicit ports are accepted in the configured allowlist.
Unconfigured paths, query variants, unsupported schemes, and credential-bearing URLs are rejected
before a link is created.

The allowlist is a server-side trust boundary; clients cannot expand it through request data.

### Return an enumeration-resistant request response

Valid request payloads always receive the same `202` response whether the normalized email maps to
an eligible user or not. Unknown users do not create database records or trigger mail delivery.
Invalid payloads and disallowed redirects are rejected as invalid payloads.

For an eligible user, the link record is created in a transaction with `email_status=pending` and
request metadata. Mail delivery then changes the status to `sent` or `error`; delivery failure does
not change the generic public response.

### Bootstrap Directus sessions and consume links in one transaction

Redemption hashes the submitted token and selects an eligible, unexpired, unredeemed link with a row
lock. The row lock serializes concurrent redemption attempts for the same link. The associated
Directus user is loaded by ID, including status, provider, and `tfa_secret`; the user's email is not
used as the authenticated principal. The user must be active and use Directus's default provider.

If `tfa_secret` is present, redemption requires an OTP and verifies it with Directus's `TFAService`
using the current transaction and schema. Missing or invalid OTPs throw Directus's
`InvalidOtpError`, allowing clients to show OTP UI. Because this error is thrown inside the
transaction, no bootstrap session is created and the magic link remains reusable.

Known limitation: when `tfa_secret` is absent, the bootstrap-session-plus-refresh path does not
currently preserve Directus's `enforce_tfa` JWT claim for users whose role requires TFA. Such a user
may receive a normal authenticated session instead of Directus's required TFA setup state. This is
tracked as a security follow-up; the intended fix is to preserve the claim through a supported
Directus authentication hook or equivalent supported authentication path.

Once link and TFA validation succeed, the extension generates a cryptographically secure,
short-lived bootstrap token and inserts a temporary `directus_sessions` row associated with the
Directus user ID. Request metadata such as IP address, user agent, and origin is copied where
available. This row is an implementation bridge, not the consumer-facing session and not a second
authentication system.

The extension then invokes `AuthenticationService.refresh(bootstrapToken, { session })`, forwarding
whether the requested mode is stateful. Directus owns the resulting access token, refresh-token
rotation, JWT claims, permissions, expiration, cookies, and stateful session behavior. The extension
does not call password-based `AuthenticationService.login()` and does not reimplement session
issuance.

Only after refresh succeeds does the extension atomically set `redeemed_at`, defensively requiring
the link to remain unredeemed. The lookup, TFA verification, bootstrap insert, refresh, and
redemption update share one transaction. Any failure rolls back the bootstrap row and leaves the
magic link available for a valid retry; a successful transaction can consume a link only once.

### Mirror Directus session modes

Redeem defaults to JSON and accepts `json`, `cookie`, and `session`:

| Mode      | Result                                                    |
| --------- | --------------------------------------------------------- |
| `json`    | Access and refresh tokens in JSON                         |
| `cookie`  | Access token in JSON; refresh token in an HttpOnly cookie |
| `session` | Stateful session token in an HttpOnly cookie              |

Cookie names, TTL, domain, `Secure`, and `SameSite` settings come from the relevant Directus
environment variables. Cookie and session modes require deployment-level CSRF protections because
the browser sends credentials automatically. Frontend clients must remove the raw token from the URL
immediately and keep it out of browser history, analytics, logs, and third-party requests.

### Delegate mail and runtime security to Directus and the deployment

The extension uses Directus's `MailService` and its configured SMTP transport. `EMAIL_FROM`, SMTP
credentials, CORS, rate limiting, and edge protections remain deployment or Directus concerns. The
extension supports optional `MAGIC_LINKS_EMAIL_REPLY_TO` and `MAGIC_LINKS_EMAIL_SENDER` values, but
does not replace Directus mail configuration.

The extension requires a trusted, non-sandboxed Directus runtime because it uses normal server-side
Directus services, database transactions, and cryptographic Node APIs. The `magic_links` collection
must remain private; public clients interact only through the two endpoint routes.

## Alternatives considered

- Store raw tokens: rejected because a database read or backup would become an authentication
  credential disclosure.
- Return different request responses for known users: rejected because it enables account
  enumeration.
- Implement authentication independently: rejected because it would duplicate Directus provider,
  TFA, token, and session behavior.
- Authenticate through `AuthenticationService.login()`: rejected because the default provider
  requires the user's password and is the wrong abstraction for possession of a valid magic-link
  token.
- Expose a public `createSessionForUser()` abstraction: unavailable in Directus; the short-lived
  bootstrap session plus `AuthenticationService.refresh()` preserves Directus's normal session
  pipeline without duplicating it in the extension.
- Mark a link redeemed before authentication: rejected because failed OTP or authentication would
  consume a usable link and weaken retry behavior.
- Allow arbitrary redirect URLs: rejected because it enables link exfiltration through attacker-
  controlled destinations.
- Expose the magic-link collection to public CRUD: rejected because it would expose token digests,
  user relations, and request metadata.

## Consequences

The design reuses Directus's authentication and cookie contracts and keeps the database useful for
auditing delivery state without storing bearer credentials. It adds transaction and row-locking
requirements, requires careful deployment configuration for SMTP, CORS, rate limiting, and CSRF, and
makes secret rotation invalidate outstanding links by design.

Cleanup is opt-in and removes expired or redeemed records after the configured retention window.
When disabled, consumers must provide their own retention process if records should not remain
indefinitely. Consumers must copy and configure the Liquid template and must treat the request
response as intentionally non-authoritative about account existence.

## Reconsideration criteria

Revisit this decision if Directus changes its authentication or cookie contracts, if sandboxed
runtime support becomes a release requirement, if a separate identity provider must be supported, or
if operational evidence requires rate limiting, token lifetime, redirect matching, or cleanup
semantics beyond these boundaries.
