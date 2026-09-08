---
name: directus-markdown-editor
description: Install and use the Directus-native Markdown/MDC Tiptap interface.
---

# Directus Markdown Editor

Install `@onderwijsin/directus-markdown-editor` in a Directus instance compatible with Directus 12,
then restart or reload extensions. Configure a Directus `text` field with the **Markdown (MDC)**
interface. The field value is MDC Markdown; do not create a second Tiptap JSON field.

This is a non-sandboxed app extension. Deploy it only in a trusted Directus installation.

The interface supports ordinary Markdown plus generic block syntax such as:

```md
::callout{tone="warning"} Some **rich text**. ::
```

and generic inline syntax such as `:icon{name="check"}`. String attributes preserve escaped quotes
and backslashes, while shorthand booleans and dynamic JSON bindings retain their value types. Named
slots and MDC YAML props are also supported:

```md
::hero
---

theme: dark
---

#description Supporting **rich text**. ::
```

Component names are data and do not need to be registered in the editor. The consuming Nuxt
application remains responsible for rendering those names through its own MDC/Comark setup.

The editor provides read-only/disabled behavior, safe external value resynchronization, a
configuration-driven Markdown toolbar, contextual bubble controls, an alias-aware grouped slash
menu, polished generic MDC NodeViews, a `+` insert control followed by a drag handle, block
duplicate/move/delete actions, headings 1–6, lists, blockquotes, fenced code, tables, hard breaks,
metadata-driven component insertion and prop editing, explicit Markdown source mode, image/video
media insertion, and Directus-native link editing through the link button or `Mod-k`. The final
toolbar action enters a viewport-filling full-screen mode, switches to an exit icon while active,
and closes on Escape.

Configure **Available editor tools** to expose all controls or a field-specific subset. Its
multiselect includes **All tools** and **Deselect all**, and the selected tools consistently govern
the toolbar, slash menu, contextual controls, insertion actions, and native Tiptap shortcuts. **Full
screen** is an independently selectable tool. Hiding component insertion leaves the settings
controls for already-persisted components active.

Code blocks use Shiki's `github-light` and `github-dark` themes and store Nuxt Content-compatible
metadata. The searchable language select contains common general-purpose languages, web-development
formats, and data/configuration file types. A filename/path is written after the language
(`ts [app/nuxt.config.ts]`); enabling the collapsible icon toggle wraps the fence in
`::code-collapse` and `::` delimiters. Tab and Shift-Tab indent and outdent code without moving
focus, and Enter preserves the current line's indentation. While a code block is active,
incompatible formatting and insertion actions are disabled. Shiki highlighting initializes in
read-only item views and refreshes when Directus switches the same interface instance into editable
draft mode. The complete Shiki grammar registry is excluded; the shared highlighter loads only the
supported grammars used by the current document.

Slash commands can be found by their display label or alternate names (`text`, `h1`–`h6`, `ul`,
`ol`, `quote`, `separator`, `line break`, `grid`, and similar terms). They support Arrow Up/Down,
Home, End, Enter, and Escape. The UI uses Directus Studio's globally registered primitives directly;
there is no bundled fallback component layer.

Empty named component slots are preserved when backspacing, and exiting a trailing empty slot
creates and focuses a paragraph directly after the component. Opening another editor overlay closes
an active slash menu. Inline components open their property drawer directly when clicked. Block
controls stay behind the sticky toolbar. The table toolbar preserves its table selection while its
row, column, header, merge, split, and delete actions run; deletion supports both cell-active and
node-selected tables.

Choose one component metadata source in the interface configuration:

| Option                        | Default | Behavior                                                                                          |
| ----------------------------- | ------- | ------------------------------------------------------------------------------------------------- |
| Use static component metadata | `false` | When disabled, the editor uses **Component metadata URL**. When enabled, it uses the static JSON. |
| Component metadata URL        | unset   | Optional public JSON endpoint, shown only while static metadata mode is disabled.                 |
| Static component metadata     | unset   | Required JSON value, shown only while static metadata mode is enabled.                            |

Both metadata sources accept an array of objects or an object with a `components` array; each object
requires `name` and may include `label`, `description`, `props`, and `slots`. The editor validates
either source using the same boundary. Static mode does not make a metadata HTTP request.

Project metadata is validated at the browser boundary. For example:

```json
{
  "components": [
    {
      "name": "Callout",
      "label": "Callout",
      "props": { "tone": { "type": "'info' | 'warning'", "values": ["info", "warning"] } },
      "slots": ["default"]
    }
  ]
}
```

Source mode blocks lossy normalization until explicitly accepted. Image URLs accept HTTP(S),
relative paths, and Directus `/assets/{id}` paths; unsafe executable/data protocols are rejected.
Rich media, image transformations/captions, and advanced unsupported-content recovery remain
deferred.

## Configure record references

References are an opt-in authoring capability. Configure the interface as follows:

| Interface option        | Default  | Required and operational behavior                                                                    |
| ----------------------- | -------- | ---------------------------------------------------------------------------------------------------- |
| Use record references   | `false`  | Enables the picker, persisted-node editor, and document integrity controller.                        |
| Reference collections   | unset    | Required non-empty JSON array when enabled; each collection may appear once.                         |
| Reference snapshot mode | `detect` | `snapshot` verifies availability, `detect` reports changes, `sync` refreshes changed snapshots.      |
| Available editor tools  | `all`    | Include `reference` for toolbar and bare-`@` insertion. This does not govern editing existing nodes. |

Use direct field names only:

```json
[
  {
    "collection": "articles",
    "displayField": "title",
    "searchFields": ["title", "slug"],
    "dataFields": ["slug", "status", "category"]
  },
  {
    "collection": "programs",
    "displayField": "name",
    "dataFields": ["slug", "type"]
  }
]
```

`collection` and `displayField` are required. `searchFields` defaults to the display field and must
contain only Directus `string` or `text` fields. `dataFields` defaults to an empty list and controls
the complete projected snapshot—no full record is copied implicitly. Repeated field names are
de-duplicated in order. The editor uses Directus field metadata to discover primary keys, including
keys not named `id`, and disables only invalid collection configurations. V1 rejects nested paths,
wildcards, relational aliases, foreign-key fields, and relation traversal.

Authors can use the Reference toolbar button immediately after Link or type a bare `@` at the start
of a text block/after whitespace and press Enter. The latter intentionally ignores email addresses.
Search starts only after a query, searches every valid collection independently, and shows up to
five ranked results. Hiding the `reference` editor tool removes both insertion paths while leaving
persisted Reference nodes editable. Turning off **Use record references** unmounts all
Reference-specific behavior, but generic MDC parsing keeps stored nodes intact.

The persisted frontend contract is ordinary MDC:

```md
:Reference{collection="articles" item="article-7" label="Becoming a teacher" text="this article"
icon="school" :data="{\"slug\":\"becoming-a-teacher\"}"}
```

New nodes require `collection`, `item`, `label`, and object `data`. `item` remains string or
numeric. An empty source display value falls back to `String(item)`. Optional `text` and `icon` are
omitted when blank. Consumer renderers should display `text ?? label`; `icon` is a Directus/Material
icon name. `label` and `data` belong to the source snapshot, while `text` and `icon` belong to the
author and survive refresh, sync, and source replacement. `Reference` is a reserved built-in name
and cannot also be inserted through project component metadata.

All reads use the current Studio user's authenticated `useApi()` client. Grant authors read access
only to the configured collections and projected fields they should discover. Search and integrity
requests never request `*` or expand relations. A `403`, `404`, or absent result is reported as
“source not available” because Directus cannot reliably distinguish removal from permission denial
in this authoring context. Unexpected/network failures are non-destructive verification errors.

The editor scans once after document hydration and after a complete external Markdown replacement.
It de-duplicates source resolution while retaining occurrence-specific repair actions:

- `snapshot`: verify source availability; compare snapshots only after explicit refresh or source
  replacement.
- `detect`: compare current `label`/`data`, report stale occurrences, and offer Refresh, Replace,
  Remove, and Refresh all outdated.
- `sync`: update stale `label`/`data` in the editor in a consolidated transaction. This can make the
  field dirty, but it never calls the item update API or saves automatically.

Malformed external Reference nodes remain generic selectable MDC atoms instead of being discarded.
The integrity report can replace or remove malformed, unconfigured, and unavailable occurrences;
transient verification errors offer retry only. The extension does not provide frontend rendering,
relational projection, reverse indexing, Directus update/delete hooks, cascade cleanup, or a
server-side document scanner.
