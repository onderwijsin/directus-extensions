# Extension entrypoints

The declared `directus:extension` metadata and official Directus scaffold are authoritative. Do not
normalize every extension to one layout.

- endpoints, hooks, and themes use a focused `src/index.ts` entrypoint;
- app extensions register from `src/index.ts` and provide the matching component when required;
- operations keep their app and API entrypoints separate; and
- bundles keep independently typed entries under `src/<entry>/` and synchronize their metadata.

Keep registration and orchestration at the entrypoint. Move domain logic, schemas, services, types,
and UI components into nearby owned files as complexity appears. Sandbox mode is optional in this
repository; use it only when an extension's requirements fit its restrictions and Marketplace
distribution justifies the trade-off. Do not import arbitrary workspace packages from sandboxed
code. Use the Directus MCP to verify event and context contracts.
