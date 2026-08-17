# @onderwijsin/directus-magic-links-bundle

Passwordless magic-link authentication for Directus frontend clients.

This package is currently scaffolded. The endpoint and hook entrypoints are present, and the startup
hook can ensure the portable magic-link collection schema, but magic-link request, redemption,
cleanup, and email delivery logic are not implemented yet.

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
| `MAGIC_LINKS_COLLECTION`                       | `directus_magic_links`     | Magic-link collection name.                          |
| `MAGIC_LINKS_EMAIL_TEMPLATE`                   | `magic-link`               | Directus Liquid template name.                       |
| `MAGIC_LINKS_EMAIL_SUBJECT`                    | unset                      | Optional subject passed to the mail service.         |
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

When schema changes are enabled, the startup hook creates the portable `directus_magic_links`
collection, fields, and relation from the package's exported schema data. Existing compatible schema
resources are preserved. Set `DIRECTUS_EXTENSIONS_SCHEMA_CHANGES_ENABLED=false` to disable schema
changes globally, or `MAGIC_LINKS_SCHEMA_CHANGES_ENABLED=false` to disable only this bundle.

The schema data is also available at:

```ts
import schema from '@onderwijsin/directus-magic-links-bundle/schema'
```

## Planned package surfaces

- API endpoint bundle entry for `/auth/magic-links`;
- startup and scheduled-maintenance hook entry;
- portable schema definition at `@onderwijsin/directus-magic-links/schema`;
- consumer documentation and frontend integration skill.

The eventual implementation requires a trusted Directus runtime and a configured SMTP transport. It
will not modify the Directus Data Studio authentication flow.
