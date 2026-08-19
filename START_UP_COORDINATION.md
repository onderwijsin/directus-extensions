# Directus Startup Coordination and Ensure Utilities

## Status

Architecture specification for the implemented redesign. Policy definitions remain consumer-owned;
this feature does not add a concrete policy fixture.

## Decision summary

Introduce one startup abstraction: `createDirectusStartupCoordinator`.

It owns one ordered startup plan and one coordination lock. Schema changes and data seeds are phases
in that plan, rather than independent `server.start` handlers. This gives the project a single place
to guarantee:

1. schema callbacks run in registration order;
2. all schema callbacks complete before any data-seed callback starts; and
3. data-seed callbacks run in registration order.

Do not introduce separate public `registerSchemaChangeOnStart` and `registerDataSeedOnStart`
wrappers in the redesigned API. They would suggest ordering guarantees that are difficult to provide
when each call owns an independent Directus action handler. Existing schema registration should be
migrated to `createDirectusStartupCoordinator` immediately.

The first data-seed resource is a Directus policy. The policy data itself is intentionally out of
scope for this change.

## Current implementation constraints

The current `schema-management` implementation combines resource-specific logic with:

- provider resolution;
- lock acquisition and release;
- error handling;
- operation logging; and
- startup registration.

`registerSchemaChangeOnStart` currently installs a fire-and-forget `server.start` handler. Directus
action registration order should not be treated as a public ordering contract. A shared startup
coordinator is therefore required.

The current callback type is unnecessarily coupled to the schema result:

```ts
;() => Promise<EnsureDirectusSchemaResult>
```

Startup callbacks should become:

```ts
;() => Promise<void>
```

Individual ensure functions may still return an internal/public result when called directly.

## Type source of truth

Use the types exported by `@directus/types` instead of inferring mutation payloads from service
method parameters:

```ts
import type { Policy, RawCollection, RawField } from '@directus/types'
```

The Directus 16.1.0 declarations confirm:

- `CollectionsService.createOne` accepts `RawCollection`;
- `RawCollection.fields` accepts `RawField[]`;
- `FieldsService.createField` uses the same raw field shape; and
- `PoliciesService` is an `AbstractService<Policy>`.

The implementation should still type-check the exact policy service mutation signature before using
a `Policy` value as a create payload. If Directus exposes a narrower mutation type for that service,
use the official Directus type rather than reintroducing `Parameters<...>` inference.

## Shared ensure input

Create one base input contract for all Directus ensure operations:

```ts
type Database = ApiExtensionContext['database']
type Services = ApiExtensionContext['services']

interface BaseEnsureInput {
  id: string
  database: Database
  logger: LoggerLike
  services: Services
  options?: BaseEnsureOptions
}
```

`id` replaces the current `extensionId` naming inside the shared ensure layer. The public API may
retain `extensionId` temporarily if compatibility requires it, but the new base contract should use
one consistent identity name.

The shared options should contain the coordination concerns currently repeated by schema setup:

```ts
interface BaseEnsureOptions {
  abortOnError?: boolean
  lockProvider?: LockProvider
  lockProviderConfig?: DirectusStartupOptions
  lockLeaseMs?: number
}
```

Schema-specific and data-specific options should extend this only when they acquire genuinely
different behavior. Do not duplicate lock-provider resolution for policies, roles, or users.

## Schema ensure input

Use the Directus raw types directly:

```ts
interface DirectusSchemaDefinition {
  collections: RawCollection[]
  fields: RawField[]
  relations: Partial<Relation>[]
}

interface EnsureDirectusSchemaInput extends BaseEnsureInput {
  getSchema: (options?: { database?: Database; bypassCache?: boolean }) => Promise<SchemaOverview>
  definition: DirectusSchemaDefinition
}
```

The nested collection fields remain part of `RawCollection.fields`. The top-level fields remain
separate. The existing primary-key rule stays unchanged: a collection must carry its intended
primary key in its nested `fields` array and must not duplicate that field in the top-level array.

## Policy ensure input

Do not add a project-specific `DirectusPolicyDefinition` type. Import and use Directus's `Policy`
type:

```ts
interface EnsureDirectusPolicyInput extends BaseEnsureInput {
  definition: Policy
}
```

`ensureDirectusPolicy(input)` should use `services.PoliciesService` with the supplied database,
logger, schema context, and accountability convention already used by the schema services.

The initial operation only ensures the policy record. It must not add permissions, role-policy
assignments, user-policy assignments, or concrete policy fixtures. Those are future composable data
seeds.

## Generic ensure internals

Split the current implementation into a generic operation runner and resource-specific ensure
functions.

### Generic runner

The runner owns:

- provider resolution;
- lock acquisition and release;
- operation identity and lock naming;
- duration measurement;
- common error handling;
- `abortOnError` behavior;
- current phase/resource diagnostics; and
- common start, skip, failure, and completion logging.

Conceptually:

```ts
runDirectusEnsure({
  id,
  operation: 'schema' | 'data',
  logger,
  options,
  execute,
})
```

The runner must not know about collections, fields, relations, policies, roles, or users.

### Resource ensures

Keep resource-specific functions composable and small:

```ts
ensureCollection(...)
ensureField(...)
ensureRelation(...)
ensurePolicy(...)
```

Each function reads the existing resource, decides compatibility, creates only when absent, logs
resource-specific details, and returns a stable change identifier or `null`.

`ensureDirectusSchema` becomes an ordered orchestration of collection, field, and relation ensures.
`ensureDirectusPolicy` becomes an orchestration over the generic data runner and `ensurePolicy`.

## Policy identity and compatibility

The policy UUID is the durable identity. The name is required metadata and a fallback lookup aid,
not a reason to create duplicates.

The policy ensure algorithm should be:

1. Validate the required policy identity and name.
2. Read by the configured UUID.
3. If no UUID match exists, read by name.
4. If neither exists, create the policy with the configured UUID and name.
5. If the UUID exists with the configured name, skip it as compatible.
6. If the UUID exists with another name, log an incompatibility and preserve it.
7. If the name exists under another UUID, log an identity conflict and do not create a duplicate.

The utility must not silently rename, overwrite, delete, or reconcile policy permissions. Existing
resources remain under the site's control unless a future explicit update policy is introduced.

## Durable collection identity

`withCollectionIdentity` replaces the narrow collection-name helper and is modelled against the
actual schema shape used by the magic-links extension.

Recommended signature:

```ts
function withCollectionIdentity(
  name: string,
  definition: DirectusSchemaDefinition,
): DirectusSchemaDefinition
```

The source identity is the first collection's `collection` value, matching the current helper's
single-primary-collection contract. The helper should reject a missing or blank source identity.

It must update every typed reference to that source collection, not only the collection declaration:

```text
collections[].collection
collections[].schema.name
collections[].fields[].collection
fields[].collection
relations[].collection
relations[].related_collection
relations[].meta.many_collection
relations[].meta.one_collection
```

Only values equal to the source identity should change. Other collection names, including
`directus_users` in a relation's `related_collection` or `one_collection`, must remain untouched.

For the attached schema this means `magic_links` is replaced in:

- the collection key;
- the collection schema name;
- the nested primary-key field;
- every top-level field collection reference;
- the relation's `collection`; and
- the relation metadata's `many_collection` value. The related `many_field` value is a field name,
  not a collection identity, and must remain unchanged.

The helper should preserve all field, collection, relation, and metadata values. It should use typed
object traversal rather than serializing the definition and applying `replaceAll`.

The old collection-name helper is removed. All consumers should use `withCollectionIdentity`.

## Startup coordinator

Add a single public registration API:

```ts
interface CreateDirectusStartupCoordinatorOptions {
  name: string
  disabled: boolean
  disabledGlobally: boolean
  dataDisabledGlobally?: boolean
  lockProvider?: LockProvider
  lockProviderConfig?: DirectusStartupOptions
  lockLeaseMs?: number
}

interface DirectusStartupCoordinator {
  schema(callback: () => Promise<void>): void
  data(callback: () => Promise<void>): void
}

function createDirectusStartupCoordinator(
  action: ActionRegistrar,
  logger: LoggerLike,
  options: CreateDirectusStartupCoordinatorOptions,
): DirectusStartupCoordinator
```

The returned coordinator lets consumers declare multiple ordered operations:

```ts
const startup = createDirectusStartupCoordinator(action, logger, options)

startup.schema(async () => {
  await ensureDirectusSchema({ ... })
})

startup.data(async () => {
  await ensureDirectusPolicy({ ... })
})
```

The coordinator must register one `server.start` handler and execute the plan sequentially:

```text
acquire startup lock
  schema callback 1
  schema callback 2
  data callback 1
  data callback 2
release startup lock
```

The order of `startup.schema(...)` and `startup.data(...)` calls inside the declaration must not
change phase ordering. All schema work precedes all data work.

If a schema callback fails with aborting behavior, later schema callbacks and all data callbacks
must be skipped. If a schema ensure deliberately uses best-effort behavior and resolves normally,
the coordinator may continue to the data phase. This distinction must be covered by tests and
documented clearly.

The startup lock must cover the complete schema-plus-data plan. Separate schema and data locks are
not sufficient for cross-process ordering: one replica could begin a data seed while another replica
is still applying schema changes.

Standalone `ensureDirectusSchema` and `ensureDirectusPolicy` calls remain independently locked. The
coordinator should either pass one acquired startup lease into the generic runner or use an internal
coordination-session abstraction so nested ensures do not deadlock by reacquiring the same lock.

## Startup lock status

Provide a read-only status API for separate logic branches that need to know whether startup work
for an extension is currently running. This replaces `getSchemaChangeStatus`, whose name is too
narrow now that the lock covers schema changes and data seeds.

Recommended API:

```ts
interface DirectusStartupStatusInput {
  id: string
  options?: Pick<BaseEnsureOptions, 'lockProvider' | 'lockProviderConfig'>
}

interface DirectusStartupStatus {
  isLocked: boolean
}

function getDirectusStartupStatus(input: DirectusStartupStatusInput): Promise<DirectusStartupStatus>
```

`getDirectusStartupStatus` must:

- resolve the same lock provider as `createDirectusStartupCoordinator`;
- derive the same lock name from the extension ID;
- accept either a consumer-owned `lockProvider` or validated provider configuration;
- call only `isLocked`;
- never acquire, renew, release, or repair a lock; and
- dispose only providers created from configuration, never an explicitly supplied provider.

The status query must use the same extension ID and provider configuration as the startup
coordinator. This is required for separate branches such as a magic-links endpoint to observe the
startup state without triggering or modifying startup work.

All repository call sites use `getDirectusStartupStatus`, which inspects the shared startup lock.

## Naming and file layout

Rename the current internal `schema-management` directory to reflect the broader responsibility.
Implemented layout:

```text
src/server/directus-ensure/
  config.ts        # startup/provider environment configuration
  operations.ts    # composable schema, policy, and status operations
  provider.ts      # startup lock-provider factory
  startup.ts       # createDirectusStartupCoordinator and startup plan
  index.ts         # public exports
```

The exact filenames may be adjusted during implementation, but the important boundaries are:

- resource-specific logic is separated from coordination;
- startup orchestration is separate from resource ensuring; and
- schema and data resources live under one shared Directus-ensure namespace.

The public `/server` export surface should remain stable except for the intentional additions and
removal of the old collection-name helper.

## Tests

Add focused unit tests for:

- `RawCollection` and `RawField` definitions passing through unchanged;
- `withCollectionIdentity` updating all references from the attached schema;
- `withCollectionIdentity` preserving unrelated collections such as `directus_users`;
- malformed or missing source collection identity;
- policy creation with explicit UUID and name;
- compatible policy skipping;
- UUID/name conflicts;
- policy service construction with the supplied database;
- startup disabled behavior and failure logging;
- schema callbacks preserving declaration order;
- data callbacks preserving declaration order;
- all schema callbacks completing before data callbacks;
- data callbacks being skipped after an aborting schema failure; and
- one startup lock covering both phases without nested lock deadlock.

No policy fixture, permission set, role, or user should be added as part of this work.

## Documentation and release surfaces

The implementation change will require synchronized updates to:

- `packages/extension-utils/src/server/directus-ensure/**`;
- `packages/extension-utils/__tests__/schema-management.test.ts` or its renamed replacement;
- `packages/extension-utils/__tests__/exports.test.ts`;
- `packages/extension-utils/README.md`;
- `docs/extension-cookbook/extension-utils.md`;
- `.agents/skills/directus-extension-utils/SKILL.md`;
- `.agents/skills/directus-extension-utils/references/api-reference.md`; and
- one appropriately scoped Changeset for the public utility package.

Because startup ordering and shared locking affect multiple future resource types, add an
architecture decision record and link it from the cookbook if the implementation adopts this design.

## Implementation sequence

1. Confirm the exact Directus policy mutation payload type exposed by the target dependency.
2. Add the shared base input and generic ensure-runner/session types.
3. Move existing schema behavior onto the generic runner without changing its public behavior.
4. Replace inferred collection and field payload types with `RawCollection` and `RawField`.
5. Implement and test `withCollectionIdentity` against the attached magic-links schema.
6. Export `withCollectionIdentity` from the collection data processor module.
7. Add `ensureDirectusPolicy` using the imported `Policy` type and no policy fixture data.
8. Add `createDirectusStartupCoordinator` with one lock and deterministic phase sequencing.
9. Migrate schema startup registrations to the new abstraction.
10. Update exports, tests, README, cookbook, API reference, consumer skill, and Changeset.
11. Run the repository validation gates and inspect the complete diff.

## Validation for this planning change

The working tree was clean before this document was created. The Directus 16.1.0 declarations were
inspected to verify `Policy`, `RawCollection`, and `RawField`. No implementation, build, lint,
typecheck, or test commands are being claimed as run for the future feature.
