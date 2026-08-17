# @onderwijsin/directus-magic-links-bundle

Passwordless magic-link authentication for Directus frontend clients.

This package is currently scaffolded. The endpoint and hook entrypoints are present, but magic-link
request, redemption, schema setup, cleanup, and email delivery logic are not implemented yet.

## Installation

Install the bundle into a Directus project:

```sh
pnpm add @onderwijsin/directus-magic-links-bundle
```

The bundle requires a trusted Directus runtime and configured SMTP settings for email delivery.

## Planned package surfaces

- API endpoint bundle entry for `/auth/magic-links`;
- startup and scheduled-maintenance hook entry;
- portable schema definition at `@onderwijsin/directus-magic-links/schema`;
- consumer documentation and frontend integration skill.

The eventual implementation requires a trusted Directus runtime and a configured SMTP transport. It
will not modify the Directus Data Studio authentication flow.
