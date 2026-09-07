---
name: directus-markdown-editor
description: Install and use the Directus-native Markdown/MDC Tiptap interface.
---

# Directus Markdown Editor

Install `@onderwijsin/directus-markdown-editor` in a Directus instance compatible with Directus 12,
then restart or reload extensions. Configure a Directus `text` field with the **Markdown (MDC)**
interface. The field value is MDC Markdown; do not create a second Tiptap JSON field.

This is a non-sandboxed app extension. Deploy it only in a trusted self-hosted Directus
installation; it is not a general Marketplace-compatible package.

The interface supports ordinary Markdown plus generic block syntax such as:

```md
::callout{tone="warning"} Some **rich text**. ::
```

and generic inline syntax such as `:icon{name="check"}`. Named slots and MDC YAML props are also
supported:

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
media insertion, and Directus-native link editing through the link button or `Mod-k`.

Configure **Available editor tools** to expose all controls or a field-specific subset. Its
multiselect includes **All tools** and **Deselect all**, and the selected tools consistently govern
the toolbar, slash menu, contextual controls, and insertion actions.

Code blocks use Shiki highlighting and store Nuxt Content-compatible metadata. A filename/path is
written after the language (`ts [app/nuxt.config.ts]`); enabling **Collapsible** wraps the fence in
`::code-collapse` and `::` delimiters.

Slash commands can be found by their display label or alternate names (`text`, `h1`–`h6`, `ul`,
`ol`, `quote`, `separator`, `line break`, `grid`, and similar terms). They support Arrow Up/Down,
Home, End, Enter, and Escape. The UI uses Directus Studio's globally registered primitives directly;
there is no bundled fallback component layer.

The interface retains an optional **Component metadata URL** configuration for the component UI. It
accepts an array of objects, or an object with a `components` array; each object requires `name` and
may include `label`, `description`, `props`, and `slots`. The temporary **Use mock component
metadata** option remains available for local authoring and integration testing.

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
