# `@workspace/typescript-config`

Shared TypeScript configuration for the workspace. It keeps compiler behavior consistent across
extensions and supporting packages, so each package does not need to copy strictness, module, and
library settings. This is a private workspace package and is not a runtime dependency.

## Available configurations

- `base.json` provides the general strict TypeScript baseline.
- `directus-extensions.json` extends the baseline with browser and Directus-extension settings,
  including the workspace path for `@onderwijsin/directus-extension-utils`.

## Usage

Add the config package as a development dependency, then extend the configuration that matches the
package:

```json
{
  "extends": "@workspace/typescript-config/directus-extensions.json",
  "include": ["src/**/*.ts"]
}
```

Keep package-specific compiler options in the package's `tsconfig.json`. Extend this package when
the option is a workspace-wide policy; do not add package-specific paths or runtime assumptions to
the shared config.

## Development

This package contains JSON configuration only. It has no runtime build, dev server, or watch mode.
Validate changes through the consuming workspace packages:

```sh
pnpm typecheck
pnpm build
```

## Testing policy

There are no standalone unit tests for configuration files. TypeScript validation in every consuming
package is the test of record. When changing a shared option, run the full workspace typecheck and
build, then run the unit test suite to catch configuration changes that affect test transforms or
environments.
