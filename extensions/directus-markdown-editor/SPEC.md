# Directus Markdown Editor Specification

## Purpose

`@onderwijsin/directus-markdown-editor` is a Directus interface for editing Markdown that may
contain generic MDC components. It is deliberately project-neutral: component names are data, not
Tiptap extensions.

The persisted value is one Markdown/MDC string in a Directus `text` or `string` field. Tiptap JSON
is an internal editing representation and must not be stored.

## Current implementation

The current implementation provides a focused authoring surface. Its Vue component:

- initializes Tiptap 3 with `@tiptap/vue-3`;
- initializes content from the Directus field value as Markdown;
- serializes editor updates back to Markdown through the Directus `input` event;
- re-synchronizes external value changes without emitting phantom updates; and
- respects Directus disabled/read-only state;
- provides a responsive fixed toolbar for common Markdown formatting, lists, headings, blockquotes,
  horizontal rules, undo/redo, and clear formatting;
- provides a Directus-native link drawer and `Mod-k` shortcut; and
- provides a placeholder and accessible editor attributes.
- uses one typed command catalog to configure the toolbar, slash menu, and block insertion menu;
- exposes alias-aware, grouped slash commands with complete keyboard navigation;
- provides a `+` insertion control before the drag handle and block duplicate/move/delete actions;
- uses globally registered Directus UI primitives directly, without local fallback wrappers; and
- renders polished MDC block, inline, and slot views with metadata-driven settings.

Metadata-driven component insertion and prop editing, explicit Markdown source mode, and an image
drawer are supported. Directus file selection is used when `VUpload` is available from the host;
selected files are stored as portable `/assets/{id}` URLs.

## Content model

Standard Markdown is handled by Tiptap's `@tiptap/markdown` integration and StarterKit. The custom
MDC layer provides three generic nodes:

- `mdcBlock` — a block component with a name, props, delimiter depth, and editable block content;
- `mdcInline` — an inline, atomic component with a name and props; and
- `mdcSlot` — a named block structure whose content remains editable Tiptap document content.

Supported MDC forms include block components, inline components, inline attributes, named slots,
nested components, variable delimiter depth, YAML props, and Markdown inside component content.
Unknown component names remain generic nodes and are preserved by the codec.

Examples:

```md
::callout{tone="warning"} Some **rich text**. ::

This contains an :icon{name="check"} inline component.

::hero #title Become a teacher

#description Supporting **rich text**. ::
```

## Round-trip contract

The codec must support:

```text
Markdown → Tiptap → Markdown → Tiptap → Markdown
```

Round-trips must stabilize after normalization, without content loss. Byte-for-byte Markdown
preservation is not required when formatting choices are harmless. Semantic compatibility with
Comark/Nuxt Content is the frontend compatibility target.

The codec is isolated under `src/markdown/` and tested independently from Vue and Directus.

## Component metadata

The interface exposes three configuration options:

- `tools` — a Directus multiselect controlling the toolbar, slash menu, context menus, and insertion
  actions, with all tools enabled by default;
- `metadataUrl` — a public JSON endpoint containing project component metadata;
- `useMockMetadata` — a temporary fixture containing Hero, Callout, and Icon metadata.

Metadata is validated with Zod and normalized by `src/component-meta/`. A component may provide a
name, label, description, props, and slot names. Metadata changes must not change the Tiptap schema:
all project components continue to use the generic MDC nodes.

The editor loads metadata through a cancellable browser composable. Loading failures leave ordinary
Markdown editing available and disable component insertion until metadata is available. Metadata
remains UI data and does not change the Tiptap schema.

## Frontend integration

The consuming Nuxt application owns component registration and rendering. The expected flow is:

```text
Directus text field
        ↓
MDC Markdown
        ↓
Nuxt Content / Comark
        ↓
Nuxt UI Prose + project MDC components
```

The editor must not embed the consuming Nuxt application, Nuxt UI Editor, Nuxt Studio, or Comark's
editor conversion layer. Comark is used by the frontend as the parser/renderer and as a semantic
compatibility target in tests.

## Architectural rationale

- Markdown is portable, readable, diffable, and frontend-independent.
- Tiptap provides the editing model and ordinary Markdown support.
- Generic MDC nodes avoid rebuilding the editor for every consuming project's component vocabulary.
- Editable slots and component content remain real Tiptap structure rather than opaque strings.
- A separate codec boundary limits the impact of the beta Tiptap Markdown package.
- Directus integration stays small and follows normal interface value, disabled-state, and update
  lifecycle patterns.

## Deferred work

The following remain outside the current release:

- source-mode comparison and richer unsupported-content recovery; and
- image transformations, captions, and media/video selection.
