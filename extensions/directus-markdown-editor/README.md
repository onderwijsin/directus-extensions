# Directus Markdown Editor

POC of a Directus-native Tiptap interface for Markdown and generic MDC content. It stores one
canonical value: Markdown in a Directus `text` field. Tiptap JSON is only used while editing.

## Status

This release proves the content and integration boundary: ordinary Markdown, a Directus-hosted
Tiptap editor, generic MDC blocks, generic inline MDC nodes, named slots, nested delimiter handling,
YAML props, and external value synchronization. The editor intentionally has no authoring UI yet; it
is a bare editing surface for validating the content model.

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

The interface configuration retains **Component metadata URL** for the upcoming authoring UI. It
accepts either an array of component metadata objects or `{ "components": [...] }`; responses are
validated before use.

For local testing, **Use mock component metadata** remains available as a temporary configuration
fixture for the upcoming authoring UI.

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

Authoring controls, source fallback UI, drag handles, and Directus file selection are intentionally
deferred to a separate UI/UX implementation session.
