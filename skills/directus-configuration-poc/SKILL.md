---
name: directus-configuration-poc
description: Use the trusted Directus configuration POC in self-hosted deployments.
---

# Use the Directus configuration POC

Install the package as a server-side Directus hook extension in a trusted self-hosted deployment. It
loads a consumer-owned TypeScript or ESM configuration file from the path in `CONFIGURATION_PATH`.

## Install

Use a custom Directus image and copy the installed package into `/directus/extensions`. The config
file must also be able to resolve the package's `./config` subpath. See the package's
[`003.installation.md`](../../extensions/directus-configuration-poc/findings/003.installation.md)
for the Dockerfile example.

```dotenv
CONFIGURATION_PATH=/directus/configuration/config.ts
```

## Use

```ts
import { defineConfig } from '@onderwijsin/directus-configuration-poc/config'

export default defineConfig({
  value: process.env.MY_VALUE ?? '',
})
```

The default export must be an object with exactly one string property, `value`. The configuration
file runs as trusted code in the Directus Node.js process and can access environment variables and
installed packages.

This POC has no functional Directus feature and is not intended for Directus Cloud, Marketplace, or
sandbox-only deployment.
