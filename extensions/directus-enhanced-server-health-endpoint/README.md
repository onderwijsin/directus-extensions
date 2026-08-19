# @onderwijsin/directus-enhanced-server-health-endpoint

An endpoint extension that exposes a small, configurable health result derived from Directus's
built-in server health checks. You choose which check groups and component types are allowed to
influence an `error` result, while the response intentionally exposes no underlying service names,
diagnostics, or health-check details. It is intended for load balancers, uptime monitors, and
container orchestration health probes.

## Installation

```sh
pnpm add @onderwijsin/directus-enhanced-server-health-endpoint
```

Install it in a Directus `12.2.0` or newer runtime and restart Directus so the endpoint is loaded.

## Endpoint

```http
GET /server/health/enhanced
```

The endpoint does not require an application token. It evaluates the configured checks with
administrator accountability and returns only the aggregate status:

```json
{ "status": "ok" }
```

The response status is `ok`, `warn`, or `error`. `error` returns HTTP `503`; `ok` and `warn` return
HTTP `200`. Warnings are treated as `ok` unless `HEALTHCHECK_EXPOSE_WARNING_STATUS` is enabled.
Status precedence is `error` over `warn` over `ok`.

Responses include `Cache-Control: no-store, no-cache, must-revalidate, private`, `Pragma: no-cache`,
and `Expires: 0` headers.

## Configuration

Directus parses array values from JSON environment-variable values. Each check and component list
also accepts a single string, which is normalized to a one-item array. The defaults are:

| Variable                                  | Default                                                 | Description                                                     |
| ----------------------------------------- | ------------------------------------------------------- | --------------------------------------------------------------- |
| `ENHANCED_SERVER_HEALTH_ENDPOINT_ENABLED` | `true`                                                  | Disables route registration when set to `false`.                |
| `HEALTHCHECK_INCLUDE_CHECKS`              | `["*"]`                                                 | Check names to evaluate. `*` includes every check.              |
| `HEALTHCHECK_EXCLUDE_CHECKS`              | `[]`                                                    | Check names to ignore. `*` ignores every check. Exclusions win. |
| `HEALTHCHECK_INCLUDE_COMPONENTS`          | `["datastore","cache","objectstore","email","unknown"]` | Component types to evaluate.                                    |
| `HEALTHCHECK_EXCLUDE_COMPONENTS`          | `[]`                                                    | Component types to ignore. Exclusions win.                      |
| `HEALTHCHECK_EXPOSE_WARNING_STATUS`       | `false`                                                 | Allows selected `warn` components to produce `status: "warn"`.  |

For example:

```env
HEALTHCHECK_INCLUDE_CHECKS=database
HEALTHCHECK_EXCLUDE_COMPONENTS=email
HEALTHCHECK_EXPOSE_WARNING_STATUS=true
```

An excluded check or component never contributes to the result, even if it is also included. A
component must be both included and supported by Directus's health response to be evaluated.

## Monitoring

```sh
curl -i http://localhost:8055/server/health/enhanced
```

The endpoint is deliberately minimal: consumers should use the HTTP status and the JSON `status`
value, rather than depending on Directus's internal check details. The response never includes the
underlying service names or check results. If Directus cannot obtain or validate its health
response, the endpoint returns Directus's standard internal-server-error response.

## Boundaries

This package does not install Directus, configure databases or third-party services, expose the
underlying check details, or provide a readiness guarantee for dependencies not reported by
Directus. It does not create collections, roles, policies, or permissions.

This extension is non-sandboxed, so it does not carry the trust required for Directus Marketplace
distribution. Install it as an npm package in the Directus runtime. It reads Directus's internal
health service with administrator accountability, but creates or changes no collections, fields,
relations, roles, policies, permissions, or persistent data.

## License

MIT. See the repository license for licensing information.
