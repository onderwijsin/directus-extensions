# Public API

Install with `pnpm add @onderwijsin/loops-core` and import only from `@onderwijsin/loops-core`; v1
has no subpath exports.

## LMX data and parsing

```ts
import {
  loopsLmxAstSchema,
  parseLoopsLmx,
  type LoopsLmxAst,
  type LoopsLmxDiagnostic,
} from '@onderwijsin/loops-core'

const diagnostics: LoopsLmxDiagnostic[] = []
const ast: LoopsLmxAst = await parseLoopsLmx(lmx, {
  // Optional: only trusted server code should enable component expansion.
  apiKey: process.env.LOOPS_API_KEY,
  maxComponentDepth: 8,
  onDiagnostic: (diagnostic) => diagnostics.push(diagnostic),
})
```

`parseLoopsLmx` is permissive: it retains recoverable malformed text and unknown nodes, ignores
comments, and does not throw for an individual node failure. It retains the original component and
local children for load failures, cycles, invalid component responses, and depth-limit failures.
Without `apiKey`, it never performs network I/O. With `apiKey`, component retrieval is the parser's
deliberately narrow, opt-in transport exception.

Validate persisted AST before rendering with `loopsLmxAstSchema.safeParse`. The exported node
schemas are `loopsLmxTextNodeSchema`, `loopsLmxElementSchema`, and `loopsLmxNodeSchema`.

Ordered and unordered lists may nest inside list items through 12 list levels, counting the
top-level list as level 1. A deeper list is retained in the recoverable AST and reports an
`invalid_structure` diagnostic through `onDiagnostic`.

## Variables, URLs, and rendering utilities

```ts
import {
  applyInlineStyles,
  getLoopsLmxColumnsLayout,
  getLoopsLmxImageWidth,
  hasUnsupportedLoopsLmxNodes,
  isRenderableLoopsLmxElement,
  resolveLoopsLmxVariables,
  resolveSafeLoopsLmxUrl,
} from '@onderwijsin/loops-core'

const text = resolveLoopsLmxVariables('Hi {contact.firstName}', {
  contact: { firstName: 'Ada' },
})
const href = resolveSafeLoopsLmxUrl(
  'example.test/{contact.userId}',
  { contact: { userId: 'user-42' } },
  'link',
) // https://example.test/user-42

const styles = applyInlineStyles({
  blockColor: '#f5f5f5',
  paddingTop: '16',
  paddingBottom: '16',
  align: 'center',
})
// { backgroundColor: "#f5f5f5", paddingTop: "16px", paddingBottom: "16px", textAlign: "center" }
```

Only `{contact.name}`, `{event.name}`, and `{data.name}` resolve. Missing and null values become
empty strings; unknown syntax remains unchanged. Resolve every string attribute that a renderer
uses. For URL attributes, call `resolveSafeLoopsLmxUrl` directly: it resolves variables first.

Links allow `https:`, `http:`, `mailto:`, and `tel:`. Images allow only `https:` and `http:`. The
URL helper rejects relative, protocol-relative, executable, data, malformed, and unsupported URLs;
it normalizes bare hostnames to HTTPS.

Renderer helpers:

- `isRenderableLoopsLmxElement(node)`
- `hasRenderableLoopsLmxNodes(nodes)`
- `hasUnsupportedLoopsLmxNodes(nodes)` / `getUnsupportedLoopsLmxNodes(nodes)`
- `getLoopsLmxImageWidth(value)` allows integer 12–600.
- `getLoopsLmxPixels(value, minimum, maximum)` allows bounded decimal integers.
- `getLoopsLmxColumnsLayout(widths, gap, columnCount)` validates percentages, a 0–150 gap, and
  safely falls back to equal columns.
- `applyInlineStyles(attributes, enabled?)` returns a framework-neutral object of validated CSS
  declarations. It maps documented colors, borders, padding, font size, line height, and alignment;
  unknown or malformed values are omitted. Set `enabled` to `false` to return an empty object.

`Style` is metadata: neither visible nor unsupported. Do not use it as arbitrary CSS.

## Conditional rules

Use `evaluate` in the presentation layer when a renderer encounters a conditional `Section`. It
evaluates one variable-based rule and always returns a boolean; malformed rules and unsupported
variables never throw.

```ts
import { evaluate, type LoopsLmxVariables } from '@onderwijsin/loops-core'

const variables: LoopsLmxVariables = {
  contact: { plan: 'Pro' },
}

const visible = evaluate(
  { variable: '{contact.plan}', operation: 'equal', value: 'Pro' },
  variables,
  {
    onMissingVariable: false,
    onInvalidCondition: false,
    onInvalidComparison: false,
  },
)
```

Conditions support only the documented `contact`, `event`, and `data` namespaces and single-level
property names. Supported operations are `not_empty`, `empty`, `equal`, `not_equal`, `contains`,
`not_contains`, `numeric_equal`, `numeric_not_equal`, `greater_than`, `less_than`, `true`, and
`false`. An omitted operation means `not_empty`. Equality is strict and case-sensitive; `contains`
is a case-sensitive substring check; numeric operations accept numeric strings; `true` and `false`
require resolved booleans.

The optional fallbacks are `onMissingVariable`, `onInvalidCondition`, and `onInvalidComparison`,
each defaulting to `false`. `evaluateLoopsLmxCondition` is also available as a descriptive alias.

## Webhooks

```ts
import {
  loopsWebhookSchema,
  loopsWebhookEnvelopeSchema,
  verifyLoopsWebhookSignature,
} from '@onderwijsin/loops-core'

const valid = await verifyLoopsWebhookSignature(rawBody, headers, signingSecret, {
  timestampToleranceSeconds: 300,
})
if (!valid) throw new Error('Invalid webhook signature')

const body: unknown = JSON.parse(rawBody)
const envelope = loopsWebhookEnvelopeSchema.safeParse(body)
const event = loopsWebhookSchema.safeParse(body)
```

`headers` must contain `{ id, timestamp, signature }`. Verification accepts multiple versioned
signatures, validates safe integer timestamps and tolerance, uses Web Crypto HMAC-SHA256 and
constant-time comparison, and returns `false` rather than throwing for invalid inputs.

`loopsWebhookSchema` is a discriminated union covering all documented contact, email-send,
delivery/engagement, and testing events. Use `loopsWebhookEnvelopeSchema` when only the shared
metadata is needed. The package does not provide an email client or campaign schemas; install the
official Loops SDK when API transport or campaign types are needed.
