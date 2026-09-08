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

The editor supports the generic forms `::name{key="value"}` with Markdown block content,
`:name{key="value"}` for inline components, named slots such as `#description`, and MDC YAML props
between `---` delimiters. Unknown names are intentionally retained as generic nodes. Nested blocks
preserve their delimiter depth during round-trips.

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
selection. The **Full screen** action can also be enabled or disabled per field.

Type `/` at the start of a block to search grouped commands and configured MDC components. Every
built-in command includes alternate search names, such as `text`, `h1`, `quote`, `ul`, `ol`,
`separator`, `line break`, and `grid`. Use Arrow Up/Down, Home, End, Enter, and Escape without
leaving the editor.

Hover a block to reveal the polished `+` insert control followed by its drag handle. The adjacent
block menu supports duplicate, move up, move down, and delete, and its controls remain behind the
sticky toolbar while scrolling. The table toolbar preserves its active table selection while running
row, column, header, merge, split, and delete actions; deletion supports both a cell selection and a
selected table node. MDC block and inline views expose their identity while keeping their content
and named slots editable. Slot structures cannot be removed by backspacing their empty content, and
pressing Enter in a trailing empty slot paragraph creates and focuses a paragraph directly after the
component. Activating another editor overlay dismisses the slash menu.

Tiptap 3.31.0 and `@tiptap/markdown` are pinned together because the Markdown package is beta.
Fenced code is highlighted with Shiki's `github-light` and `github-dark` themes and exposes a
searchable select containing common general-purpose languages, web-development formats, and
data/configuration file types, plus optional filename/path metadata and a collapsible icon toggle.
Highlighting initializes in both read-only and editable item modes and refreshes when Directus opens
a draft without requiring a page reload. Tab and Shift-Tab indent and outdent code while the cursor
remains in the block, and Enter preserves the current line's indentation. Filenames use Nuxt Content
fence metadata such as `ts [app/nuxt.config.ts]`, while collapsible blocks use a `::code-collapse`
wrapper. Formatting and insertion actions that cannot produce valid code-block content are disabled
while a code block is active.

The interface configuration retains **Component metadata URL** for the authoring UI. It accepts
either an array of component metadata objects or `{ "components": [...] }`; responses are validated
before use.

For local testing, **Use mock component metadata** remains available as a temporary configuration
fixture for local component authoring.

A component metadata object has this shape:

```json
{
  "name": "Callout",
  "label": "Callout",
  "description": "Highlighted content",
  "props": {
    "tone": { "type": "'info' | 'warning'", "values": ["info", "warning"] }
  },
  "slots": ["default"]
}
```

Source mode refuses lossy changes until the editor user explicitly accepts normalization. Image
insertion accepts HTTP(S), relative asset paths, and Directus file selections stored as
`/assets/{id}`. Unsafe `javascript:`, `data:`, and `vbscript:` URLs are rejected.
