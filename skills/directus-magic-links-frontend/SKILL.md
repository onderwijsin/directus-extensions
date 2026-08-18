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

Successful redemption returns Directus's normal authentication result. Store refresh credentials
according to the normal Directus client guidance. In `json` mode both tokens are returned; in
`cookie` mode the refresh token is set as an HttpOnly cookie while the access token is returned; in
`session` mode the stateful session token is set as an HttpOnly cookie and the access token is not
returned. Configure fetch with credentials when using cookies. Do not send the token to analytics,
error reporting, application logs, or third-party URLs.

## TFA and errors

The flow does not bypass TFA. If Directus reports its standard OTP error, keep the token, prompt for
the OTP, and retry the same redeem request with `otp`. A failed OTP attempt does not redeem the
link.

Invalid, expired, already redeemed, inactive, and unsupported-provider tokens return Directus's
standard invalid-credentials error. Branch on Directus's actual standardized error code and status
for the installed version; do not invent or expect a magic-links-specific `MFA_REQUIRED` code.

## Browser and deployment requirements

- Use HTTPS in production and configure the exact frontend redirect URL on the server.
- Remove the token from the URL immediately after parsing it with `history.replaceState`.
- Keep the request response generic in user-facing copy so account existence is not disclosed.
- Configure CORS for the frontend origin and apply CSRF protections when using cookies or sessions.
- Rate-limit request attempts at the edge or API gateway.
