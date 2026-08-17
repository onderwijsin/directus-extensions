---
name: directus-magic-links-bundle
description: Set up and operate the Directus magic-links authentication bundle.
---

# Directus Magic Links

This skill is the operator-facing setup reference. The bundle validates its shared and
entrypoint-specific environment configuration and ensures its portable schema at Directus startup;
endpoint, cleanup, and email delivery behavior remain scaffolded.

## Configuration

Configure shared values for both entries. Schema-change and cleanup values are hook-only; token,
redirect, and email values are endpoint-only. `MAGIC_LINKS_REDIRECT_URL_ALLOWLIST` is required by
the endpoint even while the runtime behavior is scaffolded.

| Variable                                       | Default                    | Accepted values / purpose                          |
| ---------------------------------------------- | -------------------------- | -------------------------------------------------- |
| `MAGIC_LINKS_ENABLED`                          | `true`                     | Boolean; disables both entries when `false`.       |
| `DIRECTUS_EXTENSIONS_SCHEMA_CHANGES_ENABLED`   | `true`                     | Boolean global schema switch.                      |
| `MAGIC_LINKS_SCHEMA_CHANGES_ENABLED`           | `true`                     | Boolean bundle schema switch.                      |
| `MAGIC_LINKS_SCHEMA_ABORT_ON_ERROR`            | `true`                     | Boolean setup failure policy.                      |
| `DIRECTUS_EXTENSIONS_USE_LOCKED_SCHEMA_CHANGE` | `true`                     | Boolean default shared schema lock switch.         |
| `MAGIC_LINKS_USE_LOCKED_SCHEMA_CHANGE`         | unset                      | Optional boolean override for this bundle.         |
| `MAGIC_LINKS_TOKEN_SECRET`                     | Directus `SECRET` fallback | Non-empty HMAC secret.                             |
| `MAGIC_LINKS_TOKEN_TTL`                        | `15m`                      | Duration such as `30m` or `7d`.                    |
| `MAGIC_LINKS_REDIRECT_URL_ALLOWLIST`           | required                   | Non-empty array of valid redirect URLs.            |
| `MAGIC_LINKS_TOKEN_QUERY_PARAMETER`            | `token`                    | Token query parameter name.                        |
| `MAGIC_LINKS_COLLECTION`                       | `magic_links`              | Underscore-compatible collection name.             |
| `MAGIC_LINKS_EMAIL_TEMPLATE`                   | `magic-link`               | Template name using letters, numbers, `_`, or `-`. |
| `MAGIC_LINKS_EMAIL_SUBJECT`                    | unset                      | Optional non-empty email subject.                  |
| `USE_MAGIC_LINK_CLEANUP`                       | `false`                    | Boolean scheduled-cleanup switch.                  |
| `MAGIC_LINK_CLEANUP_WINDOW`                    | `24h`                      | Duration retention grace period.                   |
| `MAGIC_LINK_CLEANUP_CRON`                      | `*/15 * * * *`             | Non-empty Directus cron expression.                |

Example Directus environment:

```dotenv
MAGIC_LINKS_ENABLED=true
MAGIC_LINKS_REDIRECT_URL_ALLOWLIST=array:https://app.example.com/auth/magic-link
MAGIC_LINKS_TOKEN_TTL=15m
```

The extension also requires Directus SMTP configuration: `EMAIL_TRANSPORT=smtp`, `EMAIL_SMTP_HOST`,
`EMAIL_SMTP_PORT`, `EMAIL_SMTP_USER`, `EMAIL_SMTP_PASSWORD`, and `EMAIL_FROM`. Those variables
belong to Directus and are not parsed by the bundle schemas.

## Schema setup

With both schema switches enabled, the hook creates the hidden `magic_links` collection, its fields,
and the relation to `directus_users`. Compatible existing resources are preserved. Incompatible
structural resources are logged loudly and left unchanged. Unexpected schema service failures abort
setup by default; set `MAGIC_LINKS_SCHEMA_ABORT_ON_ERROR=false` to log the failure and continue the
hook setup.

The portable schema data is exported as `@onderwijsin/directus-magic-links-bundle/schema` for manual
inspection or application when automated schema changes are disabled.

When implementation is available, this skill will cover installation, trusted runtime requirements,
SMTP configuration, environment variables, schema setup and exported schema data, redirect URL
allowlisting, email-template setup, permissions, cleanup scheduling, and troubleshooting.
