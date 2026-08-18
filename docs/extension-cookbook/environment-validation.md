# Environment validation

Validate extension configuration at the Directus entrypoint boundary. Environment values are
external input: they can be missing, mistyped, or changed independently of the extension package.
Use a Zod schema to define the accepted configuration and fail during startup before registering
routes, events, SDK clients, or other side effects.

## Validation pattern

For server and API extensions, use the setup lifecycle before validating configuration:

1. Create the setup object with a stable extension name, the Directus environment, and the logger.
2. Call `start()`.
3. Return when `isEnabled()` is false, so disabled extensions do not validate optional runtime
   dependencies or perform other setup work.
4. Import the complete schema from the entrypoint's sibling `src/env.schema.ts` and pass it to
   `validateExtensionOptions`.
5. Use the validated options to register Directus behavior, then call `end()` only after
   registration succeeds.

Keeping the schema in `src/env.schema.ts` makes it reusable across entrypoints and gives tests a
stable import target. The validation helper logs invalid configuration and throws
`Invalid extension options ☝. Exiting.`. Do not register behavior or initialize external SDKs
before validation succeeds.

```ts
import { defineEndpoint } from '@directus/extensions-sdk'
import {
  extensionSetup,
  validateExtensionOptions,
} from '@onderwijsin/directus-extension-utils/server'
import { envSchema } from './env.schema'

const EXTENSION_NAME = 'catalog'

export default defineEndpoint((router, { env, logger }) => {
  const setup = extensionSetup(EXTENSION_NAME, env, logger)
  setup.start()

  if (!setup.isEnabled()) return

  const options = validateExtensionOptions(env, envSchema, logger)
  router.get('/health', (_request, response) => response.json({ url: options.CATALOG_URL }))

  setup.end()
})
```

The schema should describe the values the extension receives from Directus. For example:

```ts
import { z } from 'zod'

export const envSchema = z.object({
  CATALOG_ENABLED: z.boolean().default(true),
  CATALOG_URL: z.string().url(),
  CATALOG_TIMEOUT: z.number().int().positive().default(5_000),
})
```

Do not assume that every environment value is a string. Directus automatically type casts values
using context clues before making them available to extensions. Prefer a schema that reflects those
runtime values instead of adding coercion everywhere. Use explicit Directus casting syntax when a
value could otherwise be interpreted as the wrong type.

### Singular values for list options

When a configuration option is conceptually a list with type `T[]`, always accept both `T` and `T[]`
at the boundary and normalize the result to `T[]`. This keeps single-value deployments concise while
preserving the predictable array shape used by the extension at runtime. Validate the individual
values with the same schema in both cases; do not split arbitrary strings on commas.

For example, a Zod schema for a list of strings can normalize both `"database"` and `["database"]`
to `["database"]`:

```ts
const stringListSchema = z.preprocess(
  (value) => (value === undefined || Array.isArray(value) ? value : [value]),
  z.array(z.string()).default([]),
)
```

Apply this rule to include/exclude lists and other collection-valued configuration options. Document
both accepted input forms and the normalized output shape in the package README and consumer skill.

Document every extension environment variable in its package README and consumer skill, including
its type, default, accepted values, and whether it disables the extension. See
[`extension-utils.md`](extension-utils.md#extension-setup) for the shared setup and validation API.

## Directus type casting and nesting

Directus automatically type casts environment variables based on the structure of the variable. In
common cases, values are interpreted as follows:

```dotenv
PUBLIC_URL="https://example.com"       # "https://example.com"
DB_HOST="3306"                          # 3306
CORS_ENABLED="false"                   # false
STORAGE_LOCATIONS="s3,local,example"   # ["s3", "local", "example"]
```

When Directus converts environment variables into a configuration object for a third-party library,
such as `DB_*` or `REDIS_*`, variable names are converted to camelCase. A double underscore (`__`)
creates a nested object:

```dotenv
DB_CLIENT="pg"
DB_CONNECTION_STRING="postgresql://postgres:example@127.0.0.1"
DB_SSL__REJECT_UNAUTHORIZED="false"
```

```ts
{
  client: 'pg',
  connectionString: 'postgresql://postgres:example@127.0.0.1',
  ssl: {
    rejectUnauthorized: false,
  },
}
```

### Explicit type prefixes

When context is not sufficient, prefix a value with `{type}:`. Directus supports these prefixes:

| Prefix   | Example                                          | Result                                            |
| -------- | ------------------------------------------------ | ------------------------------------------------- |
| `string` | `string:value`                                   | `"value"`                                         |
| `number` | `number:3306`                                    | `3306`                                            |
| `regex`  | `regex:\\.example\\.com$`                        | `/\\.example\\.com$/`                             |
| `array`  | `array:https://example.com,https://example2.com` | `["https://example.com", "https://example2.com"]` |
| `json`   | `json:{"items": ["example1", "example2"]}`       | `{ "items": ["example1", "example2"] }`           |

Array elements can have their own prefixes, for example:

```dotenv
ALLOWED_VALUES="array:string:https://example.com,regex:\\.example3\\.com$"
```

Explicit casting also works when reading a value from a file with the `_FILE` suffix.

### Environment object syntax

Environment variables documented with a trailing `*` configure an object using the variable name
after the prefix. For `MY_ENV_*`, Directus produces these values:

```dotenv
MY_ENV_SIZE=1
MY_ENV_MAX_LENGTH=1
MY_ENV_BRAND__COLOR=red
MY_ENV_BRAND__FONT_SIZE=18px
MY_ENV_BRAND__FONT=arial
```

```ts
{
  size: 1,
  maxLength: 1,
  brand: {
    color: 'red',
    fontSize: '18px',
    font: 'arial',
  },
}
```

For the complete Directus configuration reference, see the official
[configuration introduction](https://directus.com/docs/raw/configuration/intro.md).
