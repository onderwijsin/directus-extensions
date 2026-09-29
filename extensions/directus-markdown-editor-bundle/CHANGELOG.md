# Changelog

## 0.2.0

### Minor Changes

- 4b2da13: Add typed number and multiselect component properties, image asset property controls,
  MIME-filtered media selection, image preview deselection, media block editing actions, and
  reliable toolbar formatting controls.
- cebfe92: Add inline editable AI proposals, Directus snackbar errors, and slash-menu AI insertion
  skills with a dedicated generation request contract.
- aa58af9: Add opt-in AI-assisted document and selection editing with reusable editor skills, custom
  prompts, reviewable suggestions, and a permission-aware server endpoint.
- 54042d3: Detect Directus-archived Reference sources, exclude them from pickers, and surface
  compact status tooltips and inline archived/unavailable visual cues without changing stored
  Markdown snapshots.
- e7e0013: Rename the Markdown Editor package and restructure it as a bundle containing the existing
  editor interface and a startup hook that seeds its Studio Docs article.
- 0b222fb: Report component property and slot drift after metadata hydration, reconcile it safely
  through the component drawer, flag removed components, show canvas integrity states, and display
  standard JSDoc deprecation tags for components and properties. Reference integrity now rescans
  when collection configuration changes. Integrity reports and insertion menus share responsive
  sizing, status styling, multiline change details, and deprecation indicators. Existing empty
  values are also reported when their property becomes required.
- a1424e7: Add a configurable full-screen editor action with an active exit icon and Escape
  handling.
- e67ff56: Refactor the interface around a shared command catalog, complete the toolbar and
  alias-aware slash menu, add polished block insertion and drag controls, rebuild MDC component
  settings with Directus UI primitives, remove the local UI wrapper layer, add configurable tool
  availability and Nuxt-compatible Shiki code metadata, fix MDC slot and save synchronization
  behavior, and add behavioral component coverage.
- 79b73a8: Add the first Markdown authoring UI with formatting controls and Directus-native link
  editing.
- 79b73a8: Add contextual menus, slash commands, drag handles, and generic MDC NodeViews to the
  Markdown editor.
- 79b73a8: Add metadata-driven component insertion and prop editing to the Markdown editor.
- 79b73a8: Add explicit Markdown source editing and safe Directus-compatible image insertion.
- 57b67dd: Add a Directus-native Tiptap Markdown/MDC editor interface POC.
- 21d803b: Add opt-in, permission-aware Directus item references with MDC persistence, shared item
  search, presentation editing, and document-level snapshot integrity modes.
- 87d656e: Add static component metadata as an alternative to URL loading and remove the temporary
  mock metadata option and runtime fixture.
- 924ca9a: Add typed link insertion with validated URL, internal, email, and phone values across
  toolbar, slash, and drag-handle flows, and support validated component URL controls through
  `@editor url`.
- 117b115: Require explicit block or inline node type metadata, preserve editable slot behavior, and
  make inline component insertion safe and consistent across the picker and slash menu.

### Patch Changes

- 801f139: Review selection AI suggestions in an anchored floating panel and insert generated
  content directly.
- 8909a2e: Improve component-slot navigation, nested placeholders, block movement focus, slot exit
  cleanup, multi-slot insertion focus, and slot labels.
- 4f9664f: Split Markdown editor shell, overlay, and notice responsibilities into focused Vue
  modules and add behavioral coverage for the AI endpoint, AI review UI, and Markdown source
  editing.
- 129edbd: Complete the installation, configuration, component metadata, authoring, and operational
  documentation for the Markdown Editor bundle.
- eab1e8a: Build Markdown Editor environment definitions with extension-utils' package-owned Zod
  runtime and composable Directus startup configuration.
- bcf4e21: Fix Shiki grammar loading, scoped GitHub light/dark theme styling, and code-block
  metadata controls; add a focused searchable language list and code indentation behavior; and
  disable incompatible editor actions while editing code. Keep highlighting active when Directus
  switches an item from its read-only view into an editable draft without remounting the interface.
- 5ce61f4: Keep settings available for persisted MDC components when new component insertion is
  hidden by the field's tool configuration.
- 5ce61f4: Preserve a valid cursor position when Directus synchronizes an updated Markdown field
  value.
- 8173d36: Polish reference reports, drawers, and search states; surface integrity findings through
  an explicit notice action; prevent node selections from opening text controls; and keep slash
  menus visible within the viewport.
- a1424e7: Fix configured shortcuts, toolbar lock-state recovery, MDC slot editing, table toolbar
  actions, overlay dismissal, block-control stacking, and editor styling.
- 5ce61f4: Keep the Markdown editor interface registration focused on its single app entry.
- 5ce61f4: Preserve escaped string attributes and typed dynamic values when parsing and serializing
  MDC, and document canonical multiline block syntax.
- 5ff3df1: Keep Reference report actions visible, clarify table proportions, and show
  occurrence-specific integrity notices and refresh actions in the Reference drawer.
- 0b37df2: Polish Reference insertion, search, editing, and integrity reporting; suppress reports in
  Directus comparison views; gracefully hide unavailable Component insertion actions; and restore
  blank-block placeholders.
- 5ce61f4: Exclude Shiki's complete language registry and load only supported grammars used by the
  document.
- cebfe92: Keep drag handles aligned with the first line of text blocks and the top of larger
  container blocks.
- 3bf99cd: Fix component metadata and drawer watcher types so the editor passes Vue typechecking.
- eab1e8a: Show a removable video player preview when selecting or editing video assets.
- 76558f3: Render AI review content with the editor's Markdown styles, preserve markup in selection
  requests, and provide complete marked document context for insert generation.

## 0.1.0

- Add the initial Directus-native Markdown/MDC editor POC.
