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

The POC supports ordinary Markdown plus generic block syntax such as:

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

The current POC includes a small formatting toolbar, undo/redo, read-only/disabled behavior, and
safe external value resynchronization. The toolbar also includes a **Component** menu for inserting
arbitrary block or inline MDC nodes. Configure the interface's optional **Component metadata URL**
with a public JSON endpoint to populate project component choices and basic controls for enum,
boolean, number, and text props. The endpoint must return an array of objects, or an object with a
`components` array; each object requires `name` and may include `label`, `description`, `props`, and
`slots`. Invalid responses are rejected without preventing generic component insertion.

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

The editor also provides a guarded source fallback: if visual parsing would change the initial
Markdown, source editing is required and the original value is not overwritten automatically.
Selecting a generic MDC block exposes duplicate and delete actions. Drag handles and Directus media
selection are not part of this release yet.
