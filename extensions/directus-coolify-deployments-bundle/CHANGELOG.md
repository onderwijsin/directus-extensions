# @onderwijsin/directus-coolify-deployments-bundle

## 0.3.0

### Minor Changes

- 3dadbd1: Paginate Coolify application deployment history requests and fetch pages on demand in the
  Studio module.

## 0.2.1

### Patch Changes

- a26af04: Use Directus error classes for failures raised by API extension entries.

## 0.2.0

### Minor Changes

- 611bab2: Scope Coolify application discovery to the Directus allow-list collection and add
  configurable memory or Redis caching for those records.
- 07c5c44: Add an async Directus application select and read-permission-aware application options
  endpoint to the Coolify deploy operation.
- 71f3b12: Add locked startup schema management for the `coolify_applications` collection through a
  new `coolify-deployments-hook` bundle entry.
- c2e08ae: Implement the Coolify deployment Flow operation with an async application selector and
  runtime enablement checks.
- 6043261: Authorize Coolify deployment endpoints using assigned Directus policies.
- 19eae40: Replace the diagnostic Coolify Deployments module with an application dashboard,
  deployment history and detail views, polling, deployment triggering, cancellation, and normalized
  API routes.
- 8bdfe60: Use descriptive and consistent Directus and Coolify application identifier names in
  deployment API responses and the Studio module.
- 526ee7b: Populate Coolify application metadata automatically when creating an allow-listed
  application from its application UUID.
- 71f3b12: Implement the authenticated Coolify deployment client and normalized deployment API
  routes.
- 6043261: Require all fields in the managed Coolify applications collection and disallow null
  values.
- 71f3b12: Scaffold the Coolify deployments bundle with endpoint, Studio module, Flow operation,
  configuration schemas, and normalized deployment model boundaries.
- 673086f: Seed configurable Coolify application-management, deployment-read, and deployment-trigger
  policy definitions during startup.

### Patch Changes

- 5e8aa62: Simplify the Studio module, reload route changes correctly, and hide deployment actions
  from users without trigger access.
- b5f2912: Add `COOLIFY_DEPLOYMENTS_POLL_INTERVAL_MS` to configure Studio deployment polling.
- 1f413f6: Fix custom applications-collection support for the Coolify Flow operation and improve its
  documentation and regression coverage.
- db36b2a: Harden Coolify deployment authorization for Flow operations and same-origin proxy
  handling.
- 7c93fe5: Support centralized component-based Redis configuration for the Coolify application
  cache.
- c419050: Allow generated Coolify application metadata fields to be omitted in Studio while keeping
  them non-nullable, and make the application and deployment enablement flags editable.
- a1f686f: Enrich Coolify application metadata when `application_uuid` changes during an update.
- 8fd8baf: Restore the application-view Deploy action by using the dashboard permission projection.
- 8fd8baf: Fix dashboard recent deployments being filtered out when Coolify returns internal
  application IDs.
- 1007a6b: Harden Coolify deployment ownership, custom collection handling, provider URL validation,
  and mutation-time application authorization.
- 651bfd2: Prevent updates to Coolify-managed application fields and limit dashboard deployment
  lookups to the latest deployment.
- 3d99bd8: Isolate extension-owned Redis caches with explicit extension and subsystem namespaces.
- 651bfd2: Refresh the configured application allow-list when authorizing deployment read routes.
- c419050: Store only the first production URL when Coolify returns multiple comma-separated URLs.
- 0bbcb89: Reduce Coolify dashboard overfetching with a bounded dashboard endpoint and
  lifecycle-aware polling.
- b5f2912: Fix parsing of Coolify's paginated application deployment history responses.
- c7f3e95: Use Redis-only, namespaced policy caching with global invalidation for Directus access,
  policy, and role mutations. The policies endpoint now ships its invalidation hook as part of its
  bundle, and Coolify authorization shares the same policy-cache contract with an opt-out for
  duplicate hooks.
- b5f2912: Refine the deployments dashboard tables, empty states, status badges, and application
  cards.
- 611bab2: Use Directus error middleware for Coolify endpoint authentication, validation,
  schema-lock, and upstream failures.
- b5f2912: Fix Studio module navigation to use Directus-relative routes without a hard-coded
  `/admin` prefix.
- f3e7853: Add a shared server cache initializer for configured local and Redis-backed extension
  caches, and use it in the Coolify deployments and policies endpoints.
- 3dec1fe: Use the typed hook entrypoint from `@onderwijsin/directus-extension-utils` in the Coolify
  deployments bundle.

## 0.1.0

- Scaffold the Coolify deployments bundle.
