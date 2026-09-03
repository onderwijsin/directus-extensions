# Markdown Editor UI/UX Plan

## Goal

Turn the current bare Tiptap Markdown/MDC interface into a polished Directus authoring experience,
using Nuxt UI Editor as the interaction reference and Directus Studio components as the UI kit. The
editor must remain project-neutral: consuming-project component names and metadata are data, not
dynamically-created Tiptap extensions.

## Progress

- Phase 0: completed for the current implementation scope; Tiptap references were refreshed and the
  Directus rich-text integration patterns were reviewed.
- Phase 1: implemented; ordinary Markdown authoring, placeholder, responsive fixed toolbar, command
  registry, Directus UI adapters, and link drawer/`Mod-k` editing are now in the extension.
- Phase 2: implemented; contextual menus, slash commands, generic MDC NodeViews, and drag handles
  are now in the extension.
- Phase 3: implemented; metadata loading, component insertion, prop editing, and named slots are now
  in the extension.
- Phase 4: implemented; source mode, image/file insertion, safe URL handling, and metadata error
  feedback are now in the extension.
- Phase 5: pending.

## Analysis of the current implementation

### What already works

- `src/MarkdownEditor.vue` owns the Directus interface lifecycle: initial Markdown content, `input`
  updates, external-value synchronization, and disabled/read-only state.
- `src/editor/extensions.ts` creates a small Tiptap 3 extension set with StarterKit, tables,
  Markdown, and the three generic MDC nodes.
- `src/markdown/` isolates the Markdown/MDC codec. It currently supports ordinary Markdown, generic
  block and inline MDC, named slots, nested delimiter depths, and YAML block props.
- `src/component-meta/` validates and normalizes metadata with Zod and has a temporary fixture, but
  no UI consumes it yet.
- Codec and metadata boundaries have focused unit coverage in `__tests__/markdown.test.ts`.
- `SPEC.md`, the package README, the consumer skill, and the existing Changeset document the POC
  contract and explicitly defer authoring UI.

### Current gaps and risks

- `MarkdownEditor.vue` is a single bare surface: there is no toolbar, placeholder, bubble/floating
  menu, slash menu, NodeView, drag handle, block menu, prop editor, source mode, loading state, or
  metadata error state.
- Generic MDC nodes render as plain `div`/`span` elements. They preserve data, but do not expose
  component identity, slot boundaries, props, unsupported-content status, or useful editing
  affordances.
- `metadataUrl` and `useMockMetadata` are registered options but are not loaded from the interface.
  The loader needs cancellation, stale-request protection, and an explicit UI state for malformed or
  unavailable metadata.
- The parser contract needs regression tests before UI work: the implementation expects a block
  opening line followed by a newline, while examples in `SPEC.md` also show compact one-line MDC.
  Slot syntax, closing delimiters, escaped attributes, and malformed/unsupported blocks need clear
  normalization rules.
- `@tiptap/markdown` is beta and is pinned with the rest of Tiptap. Every new Tiptap package must
  use the same exact catalog version; dependency additions require catalog and lockfile changes.
- Directus UI primitives are internal app components registered globally (`VButton`, `VMenu`,
  `VDialog`, `VInput`, `VSelect`, `VList`, `VListItem`, `VCard`, `VUpload`, `VTooltip` via the
  tooltip directive, and related components). The extension does not currently import Directus app
  internals. A small host-UI adapter must validate this runtime boundary before relying on it.
- The interface is non-sandboxed and targets Directus `>=12.2.0 <13`; browser-only UI and any
  Directus host APIs must stay within that compatibility boundary.

## Reference-derived behavior

### Nuxt UI Editor reference

The primary reference is `.reference/ui/src/runtime/components/Editor.vue`, supported by:

- `EditorToolbar.vue`: fixed, bubble, and floating layouts; grouped actions; active/disabled command
  state; tooltips; dropdowns; and extensible handlers.
- `EditorSuggestionMenu.vue`: Tiptap suggestion plugin lifecycle, keyboard-driven selection, grouped
  items, labels/separators, filtering, and handler-based execution.
- `EditorDragHandle.vue`: Tiptap drag-handle lifecycle, floating positioning, node selection, and
  block-level interaction.
- `EditorMentionMenu.vue` and `EditorEmojiMenu.vue`: reusable suggestion-menu patterns and cleanup.
- `useEditorMenu.ts`: the model for positioning, filtering, keyboard navigation, selection ranges,
  and plugin registration.

The important UX qualities to reproduce are a quiet editing canvas, contextual controls that appear
near the current selection/block, keyboard-first menus, predictable focus restoration, disabled
state propagation, and an extensible command model rather than toolbar-specific mutations.

### Directus UI reference

`.reference/directus/app/src/components` provides the host primitives and conventions:

- `VButton`: icon/ghost/active/disabled states and tooltip support suitable for editor chrome.
- `VMenu`: positioned, focus-trapped contextual menus with click-outside and Escape behavior.
- `VDialog`: focus-trapped prop drawers and modal forms with Apply/Escape semantics.
- `VInput`, `VSelect`, `VList`, `VListItem`, `VCard`, `VDivider`, `VNotice`, and progress/skeleton
  components for metadata search, prop forms, menu content, errors, and loading states.
- `VUpload`/`VImage` and the existing Directus file flows for a later image/media insertion path.
- `VIcon` and the Directus icon vocabulary for consistent editor controls.

The plan should prefer these primitives through local editor wrappers. It should not import private
Directus source paths into the published package unless a supported extension API is established. If
globally registered components are unavailable in a supported Directus host, stop and resolve that
compatibility decision before building the UI around them.

### Directus rich-text interface reference

`.reference/directus/app/src/interfaces/input-rich-text-html` is a useful integration reference even
though its visual design and HTML storage model are out of scope. In particular:

- `input-rich-text-html.vue` keeps editor construction, value synchronization, editability, and
  drawer orchestration together while delegating each concern to a composable.
- `use-image.ts`, `use-link.ts`, and `use-media.ts` model drawer state as typed selection data,
  distinguish insert-versus-edit, and re-resolve the selected node/position at save time so an
  external update or selection change does not write to a stale position.
- `drawers/image-drawer.vue`, `link-drawer.vue`, and `media-drawer.vue` show the Directus
  form/drawer contract: explicit save/cancel actions, library/URL selection, validation feedback,
  and reuse of `VDrawer`, `VUpload`, `VInput`, `VTextarea`, `VCheckbox`, tabs, and notices.
- `LinkShortcut` provides a focused `Mod-k` editor command that opens the link UI rather than
  putting link-form logic into the toolbar.
- The image flow resolves a selected Directus file into a public asset URL and preserves edit-time
  attributes. The Markdown version must make the equivalent URL/id representation an explicit
  portability decision rather than copying HTML attributes.
- The media implementation sanitizes `javascript:`, `data:`, and `vbscript:` protocols before they
  reach a rendered node. Any URL or embed form added here needs the same boundary validation.
- `useSourceCode.ts` and the normalization-warning drawers establish an important safety rule:
  content that the editor cannot represent must not be silently dropped. The Markdown editor should
  either preserve it through the generic codec or show a source/error state and block destructive
  normalization.
- The Directus tests cover selection-only transactions, dirty-state avoidance, raw mode, malformed
  content, and drawer behavior. These are useful regression categories for this extension’s value
  synchronization and source-mode implementation.

## Target architecture

Keep `MarkdownEditor.vue` as a thin composition component. Move stateful behavior into composables
and presentational/editor interaction into focused components.

### Component map

- `MarkdownEditor.vue`: Directus value contract, editor construction, options, and feature
  composition. Emits the existing `input` event and preserves disabled behavior.
- `components/EditorCanvas.vue`: editor content shell, placeholder, editor attributes, focus
  styling, and NodeView registration surface.
- `components/EditorToolbar.vue`: fixed formatting toolbar and undo/redo controls, built with local
  wrappers around Directus buttons, menus, icons, and tooltip behavior.
- `components/EditorBubbleMenu.vue`: selection-scoped inline formatting/link menu using Tiptap
  BubbleMenu and the same command registry as the fixed toolbar.
- `components/EditorFloatingMenu.vue`: empty-paragraph block insertion affordance using Tiptap
  FloatingMenu.
- `components/EditorSlashMenu.vue`: `/` suggestion plugin with keyboard navigation, standard block
  commands, and metadata-driven component insertion.
- `components/EditorBlockNodeView.vue`: visual MDC block container showing component label/name,
  unsupported status, slot content, and block actions while preserving generic node attributes.
- `components/EditorInlineNodeView.vue`: compact atomic inline component chip with accessible label,
  edit/remove actions, and unknown-component treatment.
- `components/EditorSlotNodeView.vue`: named slot boundary with slot label and editable content.
- `components/EditorDragHandle.vue`: block hover/drag affordance and context-menu trigger, based on
  Tiptap’s Vue drag-handle extension.
- `components/EditorBlockMenu.vue`: duplicate, convert, move, delete, and edit-props actions for the
  selected block, using `VMenu`/`VList` primitives.
- `components/ComponentInsertMenu.vue`: searchable metadata-driven component picker shared by slash,
  floating, and explicit insert controls.
- `components/ComponentPropsDialog.vue`: metadata-driven prop form and slot-aware insertion/editing,
  using `VDialog`, `VInput`, `VSelect`, `VCheckbox`, `VCard`, and `VNotice` as appropriate.
- `components/EditorSourceMode.vue`: optional raw Markdown/MDC editor with parse/serialize status,
  explicit apply/cancel behavior, and an unsupported-content warning.
- `components/ImageDrawer.vue`: Directus-native file/library/URL selection and image attributes,
  implemented only after the Markdown image representation is agreed; follows the Directus rich-text
  composable/drawer pattern rather than embedding a picker in the toolbar.
- `components/LinkDrawer.vue`: typed link selection/editing form opened by toolbar, bubble menu, and
  `Mod-k`; follows Directus’s save/unlink/focus behavior while serializing through the Markdown link
  mark.
- `composables/useEditorCommands.ts`: typed command registry shared by toolbar, menus, shortcuts,
  and block actions; each action exposes active, disabled, and execute behavior.
- `composables/useComponentMetadata.ts`: cancellable metadata loading, normalized state, filtering,
  and error/loading status.
- `composables/useEditorSelection.ts`: selection and selected-node state, position tracking, and
  overlay anchoring without putting DOM calculations in the root component.
- `composables/useMdcInsertion.ts`: safe construction of generic MDC nodes from metadata and
  insertion/edit transactions that preserve attrs, delimiter depth, props format, and slot
  structure.
- `composables/useImage.ts` and `composables/useLink.ts`: selection snapshots, insert-versus-edit
  state, cancellation, and save-time position re-resolution for Directus drawers.
- `ui/`: local adapter components for Directus global primitives, with a documented
  fallback/compatibility strategy and no dependency on private Directus source imports.

## Implementation phases

### Phase 0: contracts and feasibility spike

- Confirm the supported Directus host exposes the required global primitives inside a published app
  extension and document the result.
- Confirm the exact Tiptap 3 APIs/packages for Placeholder, BubbleMenu/FloatingMenu, Suggestion, Vue
  NodeViews, drag handle, image, and link behavior from the checked-out Tiptap source/docs.
- Define the command registry, component metadata view model, MDC insertion model, and source-mode
  error model before adding UI.
- Resolve MDC normalization rules and add codec tests for compact blocks, multiline blocks, named
  slots, nesting, YAML, escaped values, malformed input, and unknown components.

### Phase 1: editor foundation and ordinary Markdown UX

- Refactor the root into the component/composable boundaries above.
- Add placeholder, accessible editor attributes, stable external synchronization, selection-safe
  updates, and a Directus-native fixed toolbar.
- Implement headings, paragraph, bold, italic, strike, code, blockquote, bullet/ordered lists,
  links, tables, horizontal rule, hard break, undo, redo, and clear formatting where supported by
  the current Tiptap extension set. Route link editing through a typed drawer and `Mod-k` shortcut.
- Add fixed toolbar active/disabled states, keyboard shortcuts, tooltips, responsive grouping, and
  read-only behavior.

### Phase 2: contextual editing (completed)

- Add bubble and floating menus backed by the shared command registry. **Completed.**
- Add slash-menu infrastructure with keyboard navigation, filtering, Escape/focus restoration, and
  standard block insertion.
- Add NodeViews for `mdcBlock`, `mdcInline`, and `mdcSlot`; keep node attrs generic and preserve
  Markdown serialization as the only persisted output.
- Add visible unsupported/unknown component treatment without silently rewriting content.

### Phase 3: metadata-driven component authoring

- Load metadata from `metadataUrl` or the mock fixture through `useComponentMetadata`; cancel stale
  requests, expose loading/error/empty states, and never let metadata alter the Tiptap schema.
- Add component insertion from slash menu, floating menu, toolbar/menu entry, and inline insertion
  where the metadata permits it.
- Build prop forms from the normalized schema with typed controls for strings, booleans, enums,
  defaults, required fields, and a safe fallback for unknown types.
- Support named slot insertion and editing while keeping slot content as real Tiptap document
  structure.
- Add block selection/context actions for edit props, duplicate, move, and delete.

### Phase 4: source mode and media (completed)

- Add source mode with explicit parse validation, apply/cancel, recovery from malformed Markdown,
  and a clear distinction between unsupported syntax and an empty value. **Completed.**
- Add Directus-native image/file insertion only after the host file/upload contract is verified; use
  the Directus library/upload/URL drawer flow, preserve portable Markdown/MDC output, and define the
  chosen asset URL/id representation. Sanitize all externally supplied URLs before insertion or
  rendering. **Completed.**
- Add empty/error/loading and responsive UX polish, including focus traps, scroll containment, and
  overlay collision behavior. **Completed for the current host-adapter scope.**

### Phase 5: compatibility and release hardening

- Test packed extension loading in the local Directus instance and verify the interface in editable,
  disabled, read-only, empty, metadata-loading, metadata-error, unknown-component, and
  malformed-source states.
- Update `SPEC.md`, package README, and `skills/directus-markdown-editor/SKILL.md` for every
  consumer-visible behavior or option.
- Add one appropriately scoped Changeset for each independent publishable-package concern.
- Review bundle size, browser-only imports, host primitive compatibility, accessibility, and
  keyboard behavior before release.

## Testing plan

- Unit-test pure MDC parsing/serialization and insertion helpers independently of Vue.
- Component-test external value synchronization, disabled/read-only state, toolbar command state,
  metadata loading/error/cancellation, slash filtering, prop validation, NodeView actions, source
  mode, image/link drawer state, stale-selection protection, URL validation, and focus restoration.
- Add round-trip regression fixtures for every supported MDC form and unknown/malformed input.
- Add packed-consumer and Directus E2E coverage once extension registration, global UI primitives,
  upload behavior, or built artifact loading changes.
- Include keyboard-only and screen-reader-oriented assertions for menus, dialogs, toolbar controls,
  drag handles, and inline/block component affordances.

## Validation gates

Use the repository-required commands after implementation changes:

```text
corepack pnpm format
corepack pnpm build:utils
corepack pnpm lint:fix
corepack pnpm typecheck
corepack pnpm test:unit
corepack pnpm build
corepack pnpm validate:packages
```

Add the packed Directus E2E workflow when loading or runtime integration changes. Do not claim a
gate passed when it was skipped or blocked.

## Compatibility decisions to settle before implementation

1. Are the required Directus components guaranteed as global components for the supported Directus
   range, or does this extension need a supported host adapter/registration mechanism?
2. Is source mode part of the first polished release or a later opt-in feature?
3. What portable representation should images use in Markdown/MDC: Directus file IDs, asset URLs, or
   a configurable project-specific form?
4. Should metadata errors leave component insertion disabled, or allow manual generic component
   names with an explicit unsupported state?
5. Which MDC syntaxes are officially accepted when the current parser and `SPEC.md` examples differ?

Until these are resolved, preserve the existing persisted Markdown/MDC contract and do not introduce
new dependencies, public options, or syntax that would create an unreviewed compatibility change.
