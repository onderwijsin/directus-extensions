# Changelog

## 0.2.0

### Minor Changes

- 0746c20: Add an authenticated endpoint that resolves a user's direct and nested-role policies.
- 466c7bc: Resolve effective policies using Directus access-row and IP allow-list semantics, with
  short-lived accountability-aware caching.
- c7f3e95: Use Redis-only, namespaced policy caching with global invalidation for Directus access,
  policy, and role mutations. The policies endpoint now ships its invalidation hook as part of its
  bundle, and Coolify authorization shares the same policy-cache contract with an opt-out for
  duplicate hooks.

### Patch Changes

- 7c93fe5: Support centralized component-based Redis configuration for policy caching.
- 54cb03d: Resolve policies inherited through nested Directus roles in the users policies endpoint.
- f3e7853: Add a shared server cache initializer for configured local and Redis-backed extension
  caches, and use it in the Coolify deployments and policies endpoints.

## 0.1.0

- Initial users policies endpoint.
