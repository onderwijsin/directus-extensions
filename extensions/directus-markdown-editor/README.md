# Directus Markdown Editor

Directus-native Tiptap interface for Markdown and generic MDC content. It stores one canonical
value: Markdown in a Directus `text` field. Tiptap JSON is only used while editing.

## Status

This release provides the content boundary and the authoring UI: ordinary Markdown, a
Directus-hosted Tiptap editor, generic MDC blocks, generic inline MDC nodes, named slots, nested
delimiter handling, YAML props, metadata-driven component insertion and prop editing, source mode,
safe image/video file insertion, external value synchronization, a responsive formatting toolbar,
full-screen editing, and Directus-native link editing. The interface uses Directus Studio's globally
registered UI primitives directly and does not ship a parallel wrapper or fallback component
library.

## Install

Install `@onderwijsin/directus-markdown-editor` in Directus and restart or reload extensions. Add
the **Markdown (MDC)** interface to a `text` field. No Nuxt UI Editor, Nuxt Studio, Nuxt runtime, or
Comark runtime dependency is required. This is a non-sandboxed app extension and should be loaded
only in a trusted self-hosted Directus installation.

The editor supports multiline block components, inline components such as `:name{key="value"}`,
named slots, and MDC YAML props between `---` delimiters. Attribute strings round-trip escaped
quotes and backslashes; shorthand booleans and dynamic JSON bindings preserve their value types.
Unknown names are intentionally retained as generic nodes, and nested blocks preserve their
delimiter depth during round-trips.

```md
::callout{tone="warning"} Some **rich text**. ::
```

## Authoring controls

The configuration-driven toolbar includes undo/redo, a paragraph and heading-level selector, inline
marks, lists, blockquotes, fenced code blocks, horizontal rules, hard breaks, table insertion and
row/column operations, links, images, video, MDC components, source mode, and clear formatting. The
same command catalog powers the slash menu and block insertion controls so capabilities do not drift
between surfaces. Full-screen mode is the final toolbar action, uses an exit icon while active, and
can be closed with Escape.

Use **Available editor tools** to expose all tools or a selected subset for a field. The Directus
multiselect includes a one-click **All tools** choice and **Deselect all** action; toolbar,
slash-menu, context-menu, insertion visibility, and native keyboard shortcuts derive from the same
selection. The **Full screen** action can also be enabled or disabled per field. Hiding component
insertion does not disable the settings controls of components already stored in the field.

Type `/` at the start of a block to search grouped commands and configured MDC components. The menu
stays above the sticky toolbar, scrolls within a 48dvh maximum height, and automatically opens above
the cursor when there is not enough viewport space below it. Every built-in command includes
alternate search names, such as `text`, `h1`, `quote`, `ul`, `ol`, `separator`, `line break`, and
`grid`. Use Arrow Up/Down, Home, End, Enter, and Escape without leaving the editor.

Hover a block to reveal the polished `+` insert control followed by its drag handle. The adjacent
insert menu includes configured Components and opt-in References alongside the shared block
commands. The block menu supports duplicate, move up, move down, and delete, and its controls remain
behind the sticky toolbar while scrolling. The table toolbar preserves its active table selection
while running row, column, header, merge, split, and delete actions; deletion supports both a cell
selection and a selected table node. MDC block and inline views expose their identity while keeping
their content and named slots editable. Slot structures cannot be removed by backspacing their empty
content, and pressing Enter in a trailing empty slot paragraph creates and focuses a paragraph
directly after the component. Activating another editor overlay dismisses the slash menu.

Tiptap 3.31.0 and `@tiptap/markdown` are pinned together because the Markdown package is beta.
Fenced code is highlighted with Shiki's `github-light` and `github-dark` themes and exposes a
searchable select containing common general-purpose languages, web-development formats, and
data/configuration file types, plus optional filename/path metadata and a collapsible icon toggle.
The editor excludes Shiki's complete grammar registry and loads only grammars used by the current
document into its shared highlighter. Highlighting initializes in both read-only and editable item
modes and refreshes when Directus opens a draft without requiring a page reload. Tab and Shift-Tab
indent and outdent code while the cursor remains in the block, and Enter preserves the current
line's indentation. Filenames use Nuxt Content fence metadata such as `ts [app/nuxt.config.ts]`,
while collapsible blocks use a `::code-collapse` wrapper. Formatting and insertion actions that
cannot produce valid code-block content are disabled while a code block is active.

Component metadata can come from one of two interface configuration sources. By default, **Use
static component metadata** is disabled and **Component metadata URL** loads the metadata from a
public JSON endpoint. Enable **Use static component metadata** to configure the required **Static
component metadata** JSON value directly and disable URL loading. Both sources accept an array of
component metadata objects or `{ "components": [...] }` and are validated before use. If neither
source supplies metadata, Component insertion actions stay hidden while persisted MDC components
remain editable.

A component metadata object has this shape:

```json
{
  "name": "Callout",
  "label": "Callout",
  "nodeType": "block",
  "description": "Highlighted content",
  "props": {
    "tone": { "type": "'info' | 'warning'", "values": ["info", "warning"] }
  },
  "slots": ["default"]
}
```

`nodeType` is required and accepts `"block"` or `"inline"`. It controls whether newly inserted
components use block (`::Component`) or inline (`:Component`) MDC syntax independently of their
slots. Existing Markdown keeps its parsed node type when metadata changes or properties are edited.

For example, the equivalent static option value can wrap the same component in a `components` array:

```json
{
  "components": [
    {
      "name": "Callout",
      "label": "Callout",
      "nodeType": "block",
      "props": {
        "tone": { "type": "'info' | 'warning'", "values": ["info", "warning"] }
      },
      "slots": ["default"]
    }
  ]
}
```

Source mode refuses lossy changes until the editor user explicitly accepts normalization. Image
insertion accepts HTTP(S), relative asset paths, and Directus file selections stored as
`/assets/{id}`. Unsafe `javascript:`, `data:`, and `vbscript:` URLs are rejected.

## Directus item references

Item references are disabled by default. Enable **Use item references** on an interface and
configure at least one **Reference collection** to let authors link to items that the current Studio
user is allowed to read. Add **Reference** to **Available editor tools** (or keep **All tools**) to
expose insertion. The toolbar action appears directly after Link. Authors can also type a bare `@`
after whitespace or at the start of a text block, follow the inline Enter hint, and press Enter.
Reference is also available from the block `+` insert menu. Existing references remain editable when
the insertion tool is hidden; disabling **Use item references** removes all Reference-specific
behavior while preserving the underlying MDC Markdown.

Configure collections as JSON:

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

| Option                  | Default  | Behavior                                                                                             |
| ----------------------- | -------- | ---------------------------------------------------------------------------------------------------- |
| Use item references     | `false`  | Authoritative capability gate for item lookup, editing, and integrity checks.                        |
| Reference collections   | unset    | Required non-empty JSON array when enabled. Collection names must be unique.                         |
| Reference snapshot mode | `detect` | `snapshot` checks availability, `detect` reports stale snapshots, and `sync` refreshes them on load. |
| `collection`            | required | Directus collection to search.                                                                       |
| `displayField`          | required | Direct field used for the source label.                                                              |
| `searchFields`          | display  | Direct `string`/`text` fields searched with case-insensitive containment.                            |
| `dataFields`            | `[]`     | Direct fields copied into the persisted source snapshot.                                             |

The editor discovers each collection's actual primary key from Directus metadata and does not assume
an `id` field. V1 accepts only direct, top-level, non-relational fields. Nested paths, wildcards,
aliases backed by relationships, and M2O/O2M/M2M/M2A traversal are rejected without breaking
ordinary Markdown editing. Repeated configured field names are de-duplicated in their original
order.

Picker and integrity requests use the authenticated Studio API session and request only configured
fields plus the primary key and Directus-configured archive field. Directus collection and field
permissions therefore determine what an author can find and verify. A missing item and an item
hidden by permissions are deliberately shown as the same “source not available” state. The extension
does not use an admin token, privileged endpoint, reverse index, deletion hook, or automatic item
save.

When a collection defines both `archive_field` and `archive_value`, References automatically use
that Directus lifecycle configuration. Archived items are omitted from every picker and surfaced as
**Archived** by integrity checks, while their stored label stays readable and their source can still
be changed or the occurrence removed. Archive detection works in `snapshot`, `detect`, and `sync`
modes; `sync` never refreshes an archived Reference. A missing archive configuration disables only
archive detection, while collection metadata that names an unknown archive field produces a
non-fatal configuration warning. Items hidden by permissions remain **Unavailable** because the
editor cannot infer their archive state.

Archived Reference atoms use a warning treatment, while unavailable atoms use the error treatment.
The integrity report keeps its status rows compact and exposes a descriptive hint for every status
through the status chip tooltip.

References persist as ordinary inline MDC and continue to use the generic MDC parser and renderer:

```md
Read :Reference{collection="articles" item="article-7" label="Becoming a teacher" text="this
article" icon="school" :data="{\"slug\":\"becoming-a-teacher\"}"}.
```

`collection`, `item`, `label`, and `data` are required for new references. `item` retains a string
or numeric primary-key value. `label` and `data` are source-owned snapshots; optional `text` and
`icon` are author-owned presentation and are never overwritten by refresh or synchronization. A
frontend MDC component should render `text ?? label` and may use the Material/Directus icon name.
`Reference` is reserved and is omitted from generic component metadata and insertion.

The document-level integrity check runs after hydration and complete external value replacement, not
after every keystroke and not from individual node views. It reports malformed references,
unconfigured collections, unavailable sources, archived sources, stale snapshots in `detect` mode,
and transient verification failures in a responsive, status-coded table with row-level actions.
Authors can refresh, replace, or remove affected occurrences; resolving the last issue leaves a
success state that must be closed before editing continues. Integrity results never open the report
automatically: the sub-toolbar notice remains visible and its **Show report** action is the only
entry point. Opening an affected Reference also explains its integrity status in the drawer. Status
lookup is occurrence-specific, so refreshing one of several References to the same item does not
hide issues on the other occurrences. Integrity checks are not mounted for Directus comparison
views, so a published side containing an old snapshot cannot interrupt the pre-publish diff. The
drawer offers its soft-warning Refresh action beside **Change source** only when that Reference is
outdated. The report keeps its header and actions visible while only its table body scrolls, and
gives more width to item labels than collection and status values. `sync` updates only changed
`label` and `data` values in the editor; this can mark the Directus field dirty but never saves the
item automatically. `snapshot` still verifies source availability but skips normal snapshot
comparison. Relational projections, reverse-document lookup, server-side full-document scanning,
cascade cleanup, and frontend rendering are outside the V1 contract.
