---
name: directus-magic-links-frontend
description: Integrate a frontend client with the Directus magic-links authentication flow.
---

# Directus Magic Links Frontend

This skill is the complete frontend API reference for the implemented magic-links flow.

## Request a link

Call `POST /auth/magic-links/request`:

```ts
await fetch(`${directusUrl}/auth/magic-links/request`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    email,
    redirectUrl: `${frontendUrl}/auth/magic-link`,
  }),
})
```

The body requires `email` and `redirectUrl`. The redirect must be configured in the server's exact
allowlist. The server normalizes the email for lookup and validates the redirect before processing.

Every valid request returns `202` with the same generic response, whether or not an account exists:

```json
{
  "message": "If an account exists for this email address, a sign-in link has been sent."
}
```

Treat this response as success without attempting to determine whether the account exists. Invalid
payloads or disallowed redirects return Directus's standard invalid-payload error.

## Redeem a link

Read the `token` query parameter from the allowlisted redirect, then immediately remove it from the
address bar and browser history. Submit it to `POST /auth/magic-links/redeem`:

```ts
const result = await fetch(`${directusUrl}/auth/magic-links/redeem`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ token, mode: 'json' }),
})
```

The request accepts:

```json
{
  "token": "raw-token-from-email",
  "otp": "123456",
  "mode": "json"
}
```

`token` is required. `otp` is optional unless the user has TFA enabled. `mode` defaults to `json`
and accepts `json`, `cookie`, or `session`. The token is single-use and checked for expiry, active
user status, and the default local provider.

Successful redemption returns the same `data` shape as the Directus login endpoint. Store refresh
credentials according to the normal Directus client guidance.

`json` mode returns both tokens:

```json
{
  "data": {
    "access_token": "...",
    "refresh_token": "...",
    "expires": 900000
  }
}
```

`cookie` mode sets the refresh token as an HttpOnly cookie and returns the access token:

```json
{
  "data": {
    "access_token": "...",
    "expires": 900000
  }
}
```

`session` mode sets the stateful session token as an HttpOnly cookie and returns no token in the
body:

```json
{
  "data": {
    "expires": 900000
  }
}
```

Configure fetch with credentials when using cookies. Do not send the token to analytics, error
reporting, application logs, or third-party URLs.

## TFA and errors

The flow does not bypass TFA. Users with a configured personal TFA secret must provide an OTP; a
missing or incorrect OTP returns HTTP `401` with Directus's standard error shape:

```json
{
  "errors": [
    {
      "message": "Invalid user OTP.",
      "extensions": { "code": "INVALID_OTP" }
    }
  ]
}
```

On `INVALID_OTP`, keep the token, prompt for the OTP, and retry the same redeem request with `otp`.
A failed OTP attempt does not redeem the link.

Users whose directly assigned role has a policy with `enforce_tfa: true` and who have not configured
a personal TFA secret receive `enforce_tfa: true` in the access-token JWT. Decode that JWT payload
client-side and route the authenticated user into the application's TFA setup flow. This is only a
UI/navigation signal: do not use decoded claims for authorization, and keep server-side OTP
validation authoritative. The payload can be decoded without the Directus signing secret.

Invalid OTP attempts are not covered by Directus's normal login-attempt limiter because this flow
verifies OTP directly before calling `AuthenticationService.refresh()`. Until the extension gains a
distributed redemption limiter, deploy request and redeem routes behind an edge or API-gateway rate
limit. The planned `createKv`-backed limiter is tracked in
[the GitHub issue](https://github.com/onderwijsin/directus-extensions/issues/21).

Invalid, expired, already redeemed, inactive, and unsupported-provider tokens return Directus's
standard invalid-credentials error. Branch on Directus's actual standardized error code and status
for the installed version; do not invent or expect a magic-links-specific `MFA_REQUIRED` code.

## Browser and deployment requirements

- Use HTTPS in production and configure the exact frontend redirect URL on the server.
- Remove the token from the URL immediately after parsing it with `history.replaceState`.
- Keep the request response generic in user-facing copy so account existence is not disclosed.
- Configure CORS for the frontend origin and apply CSRF protections when using cookies or sessions.
- The bundle applies a default per-IP limit of five request attempts per minute; configure
  `MAGIC_LINKS_REQUEST_RATE_LIMIT` for a different value and add edge or API-gateway limits for
  deployment-wide protection.

## Boundaries

This skill documents a frontend integration; it does not install or configure the Directus
extension, email transport, collections, roles, policies, permissions, or infrastructure. The
frontend flow creates no Directus schema and persists no magic-link records itself; those records
and their lifecycle are owned by the server extension.
