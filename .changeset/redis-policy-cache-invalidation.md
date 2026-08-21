---
'@onderwijsin/directus-extension-utils': minor
'@onderwijsin/directus-policies-endpoint': minor
'@onderwijsin/directus-coolify-deployments-bundle': patch
---

Use Redis-only, namespaced policy caching with global invalidation for Directus access, policy, and
role mutations. The policies endpoint now ships its invalidation hook as part of its bundle, and
Coolify authorization shares the same policy-cache contract with an opt-out for duplicate hooks.
