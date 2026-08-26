# Changelog

## 0.2.2

### Patch Changes

- ca33036: Rate-limit magic-link requests per IP with a configurable five-request-per-minute
  default, independently from failed OTP redemption limits.
- c428209: Start magic-link email delivery in the background so request timing does not reveal
  whether an account exists, while retaining delivery status auditing.
- e185c11: Align magic-link redirect allowlist configuration and request validation, and require a
  non-empty allowlist.

## 0.2.1

### Patch Changes

- a26af04: Use Directus error classes for failures raised by API extension entries.

## 0.2.0

### Minor Changes

- a9ce4c3: Add opt-in scheduled cleanup for expired and redeemed magic-link records.
- Add shared and entrypoint-specific Zod environment configuration schemas for the magic-links
  bundle.
- a3700ef: Add the initial Directus magic-links bundle scaffold with endpoint, hook, schema-data,
  and consumer-skill entrypoints.
- 9da7bc4: Add the portable magic-links schema definition and ensure it during the Directus startup
  hook.
- 47697bf: Implement atomic magic-link redemption through Directus authentication, including TFA and
  session modes.
- 47697bf: Implement the magic-link request endpoint with secure token hashing, allowlisted
  redirects, transactional persistence, and Directus email delivery.
- 7c93fe5: Support all Directus email transports and component-based Redis configuration in magic
  links.
- 2a360d1: Remove the magic-links-specific and global locked-schema switches; schema setup is always
  lock-coordinated and uses the configured provider.

### Patch Changes

- d557613: Register the magic-link endpoint at its documented authentication route and cover
  Directus TFA redemption behavior against the supported Directus version.
- 2586f40: Create the configured `MAGIC_LINKS_COLLECTION` and its schema resources instead of always
  creating `magic_links`.
- 1d31410: Validate SMTP configuration, support configured collection names, refresh schema state
  between Directus schema phases, and correct the magic-link user relation.
- d557613: Return inserted and updated magic-link IDs from transactional queries so request and
  redemption operations handle PostgreSQL results correctly.
- eeee3e9: Limit failed magic-link OTP redemption attempts using Directus's configured login-attempt
  budget.
- cf4edf7: Preserve Directus's role-enforced TFA setup claim when magic-link redemption refreshes an
  access token.
- 3f50ef2: Issue normal Directus sessions from magic-link redemption through a short-lived bootstrap
  session and `AuthenticationService.refresh()`.
- 5534dc8: Share schema-lock request rejection through the server utilities package and apply it
  once as middleware to the magic-links endpoint.

## 0.1.0

- Scaffold the Directus magic-links bundle.
