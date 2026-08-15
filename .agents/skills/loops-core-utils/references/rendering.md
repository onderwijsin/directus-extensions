# Rendering LMX safely

`@onderwijsin/loops-core` returns a JSON-serializable AST and framework-neutral rendering data; it
does not render HTML or framework components. The consuming application maps AST nodes to its own
templates/components.

## Safe recursion pattern

```ts
import {
  isRenderableLoopsLmxElement,
  resolveLoopsLmxVariables,
  resolveSafeLoopsLmxUrl,
  type LoopsLmxNode,
  type LoopsLmxVariables,
} from '@onderwijsin/loops-core'

function renderNode(node: LoopsLmxNode, variables: LoopsLmxVariables) {
  if (node.type === 'text') {
    return escapeForYourFramework(resolveLoopsLmxVariables(node.value, variables))
  }
  if (!isRenderableLoopsLmxElement(node)) return null

  const href = resolveSafeLoopsLmxUrl(node.attributes.href, variables, 'link')
  return renderSupportedElement(node.name, node.children, href)
}
```

Use framework-native text interpolation rather than an HTML injection API. Adapt the `variables`
type to `LoopsLmxVariables` in application code.

## Inline styles

Use `applyInlineStyles` when a renderer supports inline presentation styles:

```ts
import { applyInlineStyles } from '@onderwijsin/loops-core'

const style = applyInlineStyles(node.attributes, stylesEnabled)
```

The returned `Record<string, string>` is framework-neutral and safe to adapt to a framework style
binding. It accepts only documented hex colors, bounded integer pixel values, percentage line
heights, and `left`/`center`/`right` alignment. Unknown and malformed attributes are omitted. The
`enabled` argument defaults to `true`; pass `false` when the renderer's style policy disables inline
styles. Never use `Style` metadata as an arbitrary CSS source.

## URLs and dynamic attributes

Variables are valid in both text and supported attributes. `resolveSafeLoopsLmxUrl` first resolves
`{contact.*}` and `{data.*}`, then validates the resulting URL.

```ts
const variables = { contact: { userId: 'user-42' } }

resolveSafeLoopsLmxUrl('example.test/account/{contact.userId}', variables, 'link') // "https://example.test/account/user-42"
```

Use `"link"` for `Link`, `Button`, `Section`, and clickable `Image` destinations. Use `"image"` for
`Image.src` or a dynamic image source. A `null` result must omit the destination rather than falling
back to the original value.

## Layout helpers

Use `getLoopsLmxImageWidth` for image width. Use `getLoopsLmxColumnsLayout` for `Columns`; it
returns safe grid data and falls back to equal widths when inputs are invalid. Use
`getLoopsLmxPixels` for bounded numeric attributes rather than applying raw LMX values to DOM
attributes or styles.

`getUnsupportedLoopsLmxNodes` can drive an optional reader notice. `hasRenderableLoopsLmxNodes`
detects whether safe visible content remains. `Style` has no visible content and is not an
unsupported-node warning.
