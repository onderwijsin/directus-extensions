# Directus Markdown Editor

Directus-native Tiptap interface for Markdown and generic MDC content. It stores one canonical
value: Markdown in a Directus `text` field. Tiptap JSON is only used while editing.

## Status

This release provides the content boundary and the authoring UI: ordinary Markdown, a
Directus-hosted Tiptap editor, generic MDC blocks, generic inline MDC nodes, named slots, nested
delimiter handling, YAML props, metadata-driven component insertion and prop editing, source mode,
safe image/video file insertion, external value synchronization, a responsive formatting toolbar,
and Directus-native link editing.

## Install

Install `@onderwijsin/directus-markdown-editor` in Directus and restart or reload extensions. Add
the **Markdown (MDC)** interface to a `text` field. No Nuxt UI Editor, Nuxt Studio, Nuxt runtime, or
Comark runtime dependency is required. This is a non-sandboxed app extension and should be loaded
only in a trusted self-hosted Directus installation.

The editor supports the generic forms `::name{key="value"}` with Markdown block content,
`:name{key="value"}` for inline components, named slots such as `#description`, and MDC YAML props
between `---` delimiters. Unknown names are intentionally retained as generic nodes. Nested blocks
preserve their delimiter depth during round-trips.

Tiptap 3.31.0 and `@tiptap/markdown` are pinned together because the Markdown package is beta.

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
