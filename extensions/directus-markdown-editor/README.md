# Directus Markdown Editor

POC of a Directus-native Tiptap interface for Markdown and generic MDC content. It stores one
canonical value: Markdown in a Directus `text` field. Tiptap JSON is only used while editing.

## Status

This release proves the POC 1/2/3 boundary: ordinary Markdown, a Directus-hosted Tiptap editor,
generic MDC blocks, generic inline MDC nodes, named slots, nested delimiter handling, YAML props,
undo/redo, external value synchronization, source safety fallback, MDC block duplication/deletion,
and a small formatting toolbar. It does not yet provide drag handles or Directus file selection.

## Install

Install `@onderwijsin/directus-markdown-editor` in Directus and restart or reload extensions. Add
the **Markdown (MDC)** interface to a `text` field. No Nuxt UI Editor, Nuxt Studio, Nuxt runtime, or
Comark runtime dependency is required. This is a non-sandboxed app extension and should be loaded
only in a trusted self-hosted Directus installation.

The current POC supports the generic forms `::name{key="value"}` with Markdown block content,
`:name{key="value"}` for inline components, named slots such as `#description`, and MDC YAML props
between `---` delimiters. Unknown names are intentionally retained as generic nodes. Nested blocks
preserve their delimiter depth during round-trips.

Tiptap 3.31.0 and `@tiptap/markdown` are pinned together because the Markdown package is beta.

The toolbar includes a **Component** insertion menu. Without configuration it accepts arbitrary
block or inline names for testing. Set the interface option **Component metadata URL** to a public
JSON endpoint to show project component choices, descriptions, slots, and basic prop controls. The
endpoint may return either an array of component metadata objects or `{ "components": [...] }`.
Invalid responses are rejected and shown as `Metadata unavailable`; generic name entry remains
available.

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

When visual parsing would change the initial Markdown, the interface opens a source editor and
requires an explicit **Apply Markdown** action. Selected MDC blocks expose duplicate and delete
actions in the toolbar, so unknown syntax is not overwritten accidentally.
