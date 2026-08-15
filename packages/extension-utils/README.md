# `@onderwijsin/directus-extension-utils`

Framework-neutral runtime utilities shared by Onderwijs in Directus extensions.

The first public export is the primitive guard set. Import shared guards from the package root or
the runtime-aware `/server`, `/app`, and `/shared` subpaths. The `/guards` subpath remains available
for compatibility. These predicates narrow values; they do not parse or validate structured external
input. Use Zod at structured runtime boundaries.

```ts
import { isRecord, isString } from '@onderwijsin/directus-extension-utils'

if (isRecord(value) && isString(value.name)) {
  return value.name
}
```

Use the runtime-aware paths when the consuming extension has an explicit runtime boundary:

```ts
import { isRecord } from '@onderwijsin/directus-extension-utils/server'
import { isString } from '@onderwijsin/directus-extension-utils/app'
import { isDefined } from '@onderwijsin/directus-extension-utils/shared'
```
