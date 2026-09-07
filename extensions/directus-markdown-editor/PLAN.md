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
  registry, direct use of Directus UI primitives, and link drawer/`Mod-k` editing are now in the
  extension.
- Phase 2: implemented; contextual menus, slash commands, generic MDC NodeViews, and drag handles
  are now in the extension.
- Phase 3: implemented; metadata loading, component insertion, prop editing, and named slots are now
  in the extension.
- Phase 4: implemented; source mode, image/file insertion, safe URL handling, and metadata error
  feedback are now in the extension.
- Phase 5: implemented for the interface package; focused component tests, package validation, and
  packed Directus verification cover the release surface.
- The field-level tool multiselect, lifecycle-safe Shiki code blocks, and MDC slot-exit/save
  regressions are implemented and covered by focused tests.

## Analysis of the current implementation

### What already works

- `src/MarkdownEditor.vue` owns the Directus interface lifecycle: initial Markdown content, `input`
  updates, external-value synchronization, and disabled/read-only state.
- `src/editor/extensions.ts` creates a small Tiptap 3 extension set with StarterKit, tables,
  Markdown, and the three generic MDC nodes.
- `src/markdown/` isolates the Markdown/MDC codec. It currently supports ordinary Markdown, generic
  block and inline MDC, named slots, nested delimiter depths, and YAML block props.
- `src/component-meta/` validates and normalizes metadata with Zod; the slash menu, component
  picker, MDC views, and settings drawer consume its normalized model.
- Codec, metadata, command, block-operation, slash-menu, and full-interface behavior have focused
  unit and Vue component coverage.
- `SPEC.md`, the package README, the consumer skill, and Changesets document the complete authoring
  contract.

### Remaining risks

- Compact one-line MDC remains a normalization edge case: the implementation expects a block opening
  line followed by a newline, while examples in `SPEC.md` also show compact forms. Future codec
  changes need focused fixtures for closing delimiters, escaped attributes, and malformed or
  unsupported blocks.
- `@tiptap/markdown` is beta and is pinned with the rest of Tiptap. Every new Tiptap package must
  use the same exact catalog version; dependency additions require catalog and lockfile changes.
- Directus UI primitives are app components registered globally (`VButton`, `VMenu`, `VDialog`,
  `VInput`, `VSelect`, `VList`, `VListItem`, `VCard`, `VUpload`, `VTooltip` via the tooltip
  directive, and related components). The extension does not currently import Directus app
  internals. The extension uses those global primitives directly and does not ship wrappers or
  fallback implementations.
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

The interface uses these globally registered primitives directly. It does not import private
Directus source paths or maintain a parallel wrapper/fallback layer. If a primitive changes in a
future supported Directus host, treat that as a host compatibility decision.

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

- `MarkdownEditor.vue`: Directus value contract, editor construction, content shell, placeholder,
  editor attributes, focus styling, options, and feature composition. It emits the existing `input`
  event and preserves disabled behavior.
- `components/EditorToolbar.vue`: configuration-driven formatting toolbar and undo/redo controls,
  built directly with Directus buttons, selects, menus, lists, and icons.
- `components/EditorContextMenus.vue`: selection-scoped formatting, block insertion, drag handling,
  and block actions using the same command registry as the fixed toolbar.
- `components/SlashMenu.vue`: `/` suggestion UI with keyboard navigation, standard block commands,
  aliases, grouping, and metadata-driven component insertion.
- `components/MdcBlockView.vue`: visual MDC block container showing component label/name,
  unsupported status, slot content, and block actions while preserving generic node attributes.
- `components/MdcInlineView.vue`: compact atomic inline component chip with accessible label,
  edit/remove actions, and unknown-component treatment.
- `components/MdcSlotView.vue`: named slot boundary with slot label and editable content.
- `components/CodeBlockView.vue`: editable Shiki code surface for language, optional filename/path,
  and Nuxt Content-compatible collapse metadata.
- `components/ComponentInsertMenu.vue`: searchable metadata-driven component picker shared by the
  toolbar, block insertion control, and MDC NodeView settings actions.
- `components/ComponentPropsDrawer.vue`: metadata-driven prop form and slot-aware insertion/editing,
  using `VDrawer`, `VInput`, `VSelect`, `VCheckbox`, and `VNotice` as appropriate.
- `components/SourceDrawer.vue`: raw Markdown/MDC editor with parse/serialize status, explicit
  apply/cancel behavior, and an unsupported-content warning.
- `components/MediaDrawer.vue`: Directus-native file/library/URL selection for images and video,
  implemented only after the Markdown image representation is agreed; follows the Directus rich-text
  composable/drawer pattern rather than embedding a picker in the toolbar.
- `components/LinkDrawer.vue`: typed link selection/editing form opened by toolbar, bubble menu, and
  `Mod-k`; follows Directus’s save/unlink/focus behavior while serializing through the Markdown link
  mark.
- `editor/commands.ts`: typed command registry shared by toolbar, menus, shortcuts, and block
  insertion; each action exposes active, disabled, and execute behavior and maps to the field-level
  tool configuration.
- `composables/useComponentMetadata.ts`: cancellable metadata loading, normalized state, filtering,
  and error/loading status.
- `editor/block.ts`: top-level block duplication, movement, and deletion transactions.
- `editor/insertion.ts`: safe construction of generic MDC nodes from metadata and insertion/edit
  transactions that preserve attrs, delimiter depth, props format, and slot structure.
- `editor/media.ts` and `editor/link.ts`: validation, selection snapshots, insert-versus-edit state,
  cancellation, and save-time position re-resolution for Directus drawers.
- Directus UI primitives are referenced by their globally registered component names; no local
  adapter layer or private Directus source import is required.

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

- Add bubble and block insertion menus backed by the shared command registry. **Completed.**
- Add slash-menu infrastructure with keyboard navigation, filtering, Escape/focus restoration, and
  standard block insertion. **Completed.**
- Add NodeViews for `mdcBlock`, `mdcInline`, and `mdcSlot`; keep node attrs generic and preserve
  Markdown serialization as the only persisted output. **Completed.**
- Add visible unsupported/unknown component treatment without silently rewriting content.
  **Completed.**

### Phase 3: metadata-driven component authoring (completed)

- Load metadata from `metadataUrl` or the mock fixture through `useComponentMetadata`; cancel stale
  requests, expose loading/error/empty states, and never let metadata alter the Tiptap schema.
- Add component insertion from slash menu, floating menu, toolbar/menu entry, and inline insertion
  where the metadata permits it.
- Build prop forms from the normalized schema with typed controls for strings, booleans, enums,
  defaults, required fields, and a safe fallback for unknown types.
- Support named slot insertion and editing while keeping slot content as real Tiptap document
  structure.
- Add block selection/context actions for edit props, duplicate, move, and delete.

All Phase 3 items are implemented.

### Phase 4: source mode and media (completed)

- Add source mode with explicit parse validation, apply/cancel, recovery from malformed Markdown,
  and a clear distinction between unsupported syntax and an empty value. **Completed.**
- Add Directus-native image/file insertion only after the host file/upload contract is verified; use
  the Directus library/upload/URL drawer flow, preserve portable Markdown/MDC output, and define the
  chosen asset URL/id representation. Sanitize all externally supplied URLs before insertion or
  rendering. **Completed.**
- Add empty/error/loading and responsive UX polish, including focus traps, scroll containment, and
  overlay collision behavior. **Completed for the supported Directus host scope.**

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

## Compatibility decisions

1. Directus `>=12.2.0 <13` supplies the required globally registered UI primitives. The extension
   consumes them directly and does not ship adapters.
2. Source mode is part of the polished release and guards lossy normalization explicitly.
3. Directus file selections persist as portable `/assets/{id}` paths; safe HTTP(S) and relative URLs
   remain accepted.
4. Metadata errors leave normal Markdown editing available and component insertion without choices;
   already-persisted unknown components remain editable as generic nodes.
5. The tested codec behavior is authoritative where compact examples remain ambiguous. Parser
   normalization rules should continue to gain regression fixtures without changing persisted syntax
   casually.
