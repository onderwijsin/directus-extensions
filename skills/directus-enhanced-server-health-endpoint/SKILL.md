---
name: directus-enhanced-server-health-endpoint
description: Configure and operate the Directus enhanced server health endpoint.
---

# Directus enhanced server health endpoint

Use `@onderwijsin/directus-enhanced-server-health-endpoint` when a Directus deployment needs a
stable, minimal health response that considers only selected built-in server health checks or
component types. The central contract is that consumers can control which checks and components may
cause an `error`, without exposing the underlying service names or diagnostic check data.

## Install and load

```sh
pnpm add @onderwijsin/directus-enhanced-server-health-endpoint
```

Use Directus `12.2.0` or newer, build the package when installing from source, and restart Directus
after adding it to the extensions directory. The package is a non-sandboxed endpoint extension and
must run in a trusted Directus installation. It invokes Directus's internal `ServerService` with
administrator accountability; it does not use the caller's permissions.

## API reference

### `GET /server/health/enhanced`

The route is registered below the existing Directus `/server/health` endpoint. It accepts no body or
query parameters and returns the aggregate status of the configured checks.

| Result                  | HTTP status | Meaning                                                              |
| ----------------------- | ----------: | -------------------------------------------------------------------- |
| `{ "status": "ok" }`    |       `200` | No selected component reports an error or exposed warning.           |
| `{ "status": "warn" }`  |       `200` | A selected component reports `warn` and warning exposure is enabled. |
| `{ "status": "error" }` |       `503` | A selected component reports `error`.                                |

Status precedence is `error > warn > ok`. If warnings are not exposed, `warn` is treated as healthy.
The endpoint sends `Content-Type: application/json` and disables intermediary caching with
`Cache-Control: no-store, no-cache, must-revalidate, private`, `Pragma: no-cache`, and `Expires: 0`.

Example probe:

```sh
curl --fail-with-body -i https://directus.example.com/server/health/enhanced
```

Use the HTTP status for a probe and parse the JSON only when an application needs the distinction
between `ok` and an exposed `warn`. The response intentionally contains no service names, check
groups, component details, observed values, thresholds, or error diagnostics.

## Configuration reference

Directus environment values are validated when the extension is enabled. Array values must be JSON
arrays, not comma-separated strings.

| Environment variable                      | Type and accepted values                                         | Default  | Effect                                                           |
| ----------------------------------------- | ---------------------------------------------------------------- | -------- | ---------------------------------------------------------------- |
| `ENHANCED_SERVER_HEALTH_ENDPOINT_ENABLED` | Boolean                                                          | `true`   | `false` prevents the route from being registered.                |
| `HEALTHCHECK_INCLUDE_CHECKS`              | Array of check names or `"*"`                                    | `["*"]`  | Selects check groups by key.                                     |
| `HEALTHCHECK_EXCLUDE_CHECKS`              | Array of check names or `"*"`                                    | `[]`     | Removes check groups after inclusion matching.                   |
| `HEALTHCHECK_INCLUDE_COMPONENTS`          | Array of `datastore`, `cache`, `objectstore`, `email`, `unknown` | All five | Selects component types.                                         |
| `HEALTHCHECK_EXCLUDE_COMPONENTS`          | Array of the component types above                               | `[]`     | Removes component types after inclusion matching.                |
| `HEALTHCHECK_EXPOSE_WARNING_STATUS`       | Boolean                                                          | `false`  | Converts selected `warn` components into a public `warn` result. |

The two check lists support `*`; component lists do not. Exclusion always wins. A component must
pass both its check filter and its component filter before its status contributes.

Example production configuration that ignores email and exposes warnings:

```env
ENHANCED_SERVER_HEALTH_ENDPOINT_ENABLED=true
HEALTHCHECK_INCLUDE_CHECKS=["*"]
HEALTHCHECK_EXCLUDE_CHECKS=[]
HEALTHCHECK_INCLUDE_COMPONENTS=["datastore","cache","objectstore","email","unknown"]
HEALTHCHECK_EXCLUDE_COMPONENTS=["email"]
HEALTHCHECK_EXPOSE_WARNING_STATUS=true
```

Example configuration that evaluates only database-related checks (using the check names returned by
the Directus version in use):

```env
HEALTHCHECK_INCLUDE_CHECKS=["database"]
HEALTHCHECK_EXCLUDE_CHECKS=[]
```

## Operations and troubleshooting

- Verify the extension is built and loaded before probing the route. A missing route means the
  package was not loaded, was disabled, or Directus needs a restart.
- A `503` means at least one selected Directus component reported `error`; narrow the filters only
  when that dependency is intentionally outside the monitor's responsibility.
- If an expected warning remains `ok`, set `HEALTHCHECK_EXPOSE_WARNING_STATUS=true` and confirm the
  component is included and not excluded.
- If configuration validation fails, inspect JSON quoting and component names in the environment.
- The extension returns only the aggregate result. Use Directus's native `/server/health` response
  for diagnostic detail.

## What this skill does not provide

The package does not provision Directus, databases, Redis, object storage, email, monitoring
systems, load balancers, permissions, or infrastructure. It does not add query parameters,
application exports, collections, or custom health checks. It reports only what Directus's internal
server health service provides and requires a trusted, non-sandboxed runtime.
