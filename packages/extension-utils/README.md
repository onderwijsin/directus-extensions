# `@onderwijsin/directus-extension-utils`

Framework-neutral runtime utilities shared by Onderwijs in Directus extensions.

The first public export is the primitive guard set. Import guards from the package root or the
`/guards` subpath. These predicates narrow values; they do not parse or validate structured external
input. Use Zod at structured runtime boundaries.

```ts
import { isRecord, isString } from '@onderwijsin/directus-extension-utils'

if (isRecord(value) && isString(value.name)) {
  return value.name
}
```
