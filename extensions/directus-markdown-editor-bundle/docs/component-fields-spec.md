# Markdown editor component fields: implementation spec

## Goal and scope

Organize the markdown editor interface components by UI role, then introduce a reusable field shell
and input controls. Apply them to the existing drawers while adding a configurable asset storage
format and the `specialInputType` metadata hint. Keep unrelated editor commands and validation rules
unchanged.

The design should make a future object or object-array editor possible, but this change does not
render, validate, serialize, or document those prop types as supported.

## Current behavior to preserve

- `ComponentPropsDrawer` renders `string`, `number`, `boolean`, and `array` props. `values` selects
  a single string or multiple strings. Existing `@editor image` stores a Directus file ID;
  `@editor url` requires an HTTP(S) URL. Missing required values and invalid URLs prevent
  Apply/Insert.
- `LinkDrawer` accepts URL, internal path, email, and phone values with type-specific validation;
  link text is required.
- `MediaDrawer` stores an asset URL for editor image/video nodes. This differs from an image
  component prop, which stores a file ID.
- `ReferenceDrawer` owns its reference source actions and icon interface fallback. `SourceDrawer`
  owns parsing, normalization consent, and source replacement. Neither workflow should be flattened
  into a generic metadata form.
- Existing component freshness, deprecated-property messages, disabled states, focus behavior, and
  explicit Apply/Cancel actions remain intact.

## Component organization

Use `src/markdown-editor-interface/components/` as the root and group by UI role:

| Directory     | Components                                                                                                                                                                            |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `drawers/`    | `ComponentPropsDrawer`, `LinkDrawer`, `MediaDrawer`, `ReferenceDrawer`, `SourceDrawer`                                                                                                |
| `fields/`     | `Field`, `StringInput`, `UrlInput`, `NumberInput`, `ImageInput`, `SelectInput`, `MultiSelectInput`, `BooleanInput`; keep the existing video upload control here as `VideoUploadField` |
| `toolbar/`    | `EditorToolbar`, `EditorContextMenus`, `EditorTableMenu`, `SlashMenu`, `ComponentInsertMenu`                                                                                          |
| `nodes/`      | `CodeBlockView`, `MdcBlockView`, `MdcInlineView`, `MdcSlotView`, `mdcNodeViewProps.ts`                                                                                                |
| `references/` | `ReferenceController`, `ReferencePicker`, `ReferenceReport`                                                                                                                           |
| `ai/`         | `AiController`                                                                                                                                                                        |
| `preview/`    | `MarkdownPreview`, `ComponentPropsReport`, `EditorNotices`                                                                                                                            |

Move files and update all imports, including imports from `editor/`, `markdown/`, the interface
root, and tests. Keep filenames and component names stable unless a rename clarifies the field API.
Do not create index barrels solely for the move. Scoped styles move with their components. Keep the
component metadata schema, editor transactions, and reference logic in their existing non-component
directories.

## `Field` contract

`Field` is a layout and accessibility shell. It accepts `label: string`, optional `description`,
`error`, `required`, `disabled`, and a stable `id` (or generates a per-instance ID). Its default
slot receives `{ id, describedBy, invalid, required, disabled }`. The drawer passes the current
input into this slot:

```vue
<Field label="Destination" description="Include https://" :error="urlError">
  <template #default="field">
    <UrlInput v-model="destination" v-bind="field" />
  </template>
</Field>
```

`Field` renders one visible label, optional required marker, description, and one error message. It
connects label and description/error to the actual control with `for`, `id`, `aria-describedby`, and
`aria-invalid`. Error text takes priority as the invalid state; description stays available to
assistive technology. The slot contract also supports composite inputs such as an image picker by
giving their primary actionable control an accessible name and description. Optional slots may
customize label or description content for deprecation hints, but must preserve the accessible
label. The shell does not own `modelValue`, parse input, infer a metadata type, or run validation.

## Reusable input contract

Each input is a thin adapter around the existing Directus control. Inputs expose a typed `v-model`
value, accept `id`, `describedBy`, `invalid`, `required`, and `disabled`, and forward relevant
control options. They do not render an additional field label, description, or error.

| Input              | Value and behavior                                                                                                                                                                                                                                                |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `StringInput`      | `string`; wraps `VInput` text.                                                                                                                                                                                                                                    |
| `UrlInput`         | `string`; wraps the same text control with URL placeholder/keyboard hint. Validation remains caller-supplied because link types differ.                                                                                                                           |
| `NumberInput`      | `number` or empty string; preserves an empty optional value and emits only finite numbers. Never silently turns empty into zero.                                                                                                                                  |
| `ImageInput`       | `string`; presents Directus image selection, preview, and clear. The interface option controls whether newly selected assets emit an ID, path, or absolute URL. Reuse the existing `ImageUploadField` behavior rather than adding a second upload implementation. |
| `SelectInput`      | `string`; one of the supplied string choices, adapting to `VSelect` items.                                                                                                                                                                                        |
| `MultiSelectInput` | `string[]`; string choices, adapting to `VSelect multiple`. Preserve empty arrays and selection order.                                                                                                                                                            |
| `BooleanInput`     | `boolean`; wraps `VCheckbox` without rendering a duplicate label. `Field` provides the accessible group label, and the checkbox receives its own concise action label only if needed by the Directus control.                                                     |

All adapters honor `disabled` and pass through the field's accessibility attributes to the real
focusable control. Control-specific coercion and Directus asset normalization live in the adapter;
rules that depend on the editing context stay with the caller. An input must not mutate Tiptap or
save a drawer.

## Validation and state ownership

The drawer owns its draft, field rules, aggregate validity, and Apply/Insert action. It passes each
error string to `Field`, and the same rule result gates submission. This prevents displayed errors
and save eligibility from diverging. Shared pure rules may live next to the inputs or existing
editor helpers when multiple drawers need them; `Field` never decides whether a value is valid.

For component props, metadata is parsed at the existing Zod boundary. The canonical special-control
tag is `{ "name": "specialInputType", "text": "url" }` (or `image`). Accept the old `editor` tag as
a compatibility fallback for existing metadata; `specialInputType` wins when both are present. Do
not add a special icon control in this change: a future `icon` hint can initially use `StringInput`.
Field selection maps the supported normalized definition to one input: image hint before URL hint;
array with `values` to multiselect; string with `values` to select; boolean to checkbox; number to
number input; otherwise text. Do not replace the metadata `type` with UI-specific types. Preserve
the current required-empty rule and URL rule, and preserve existing values during freshness refresh.
Unknown types keep the existing text fallback. Keep `ComponentPropsDrawer` responsible for
transaction, refresh, deletion, and unsaved draft state.

`LinkDrawer` retains type-specific link validation and required link text. `MediaDrawer` retains
source sanitization and image/video node commands. `ReferenceDrawer` can use `Field` for text and
icon controls while retaining its dynamic icon interface. `SourceDrawer` keeps its large textarea
and normalization notice; wrap a control in `Field` only where the shell improves its label/error
semantics. Its consent checkbox is not a metadata boolean input.

## Asset storage options

Add **Store assets as** (`id`, `path`, or `url`) and **Asset base URL** interface options. Show and
require the base URL only when `url` is selected. A selected Directus file with ID
`3d089156-1840-4e1a-97eb-3228a12566c2` is persisted as that bare ID, as
`/assets/3d089156-1840-4e1a-97eb-3228a12566c2`, or as
`https://my-directus-instance.com/assets/3d089156-1840-4e1a-97eb-3228a12566c2`, respectively. Accept
only an HTTP(S) base URL and normalize its trailing slash. A missing or invalid base URL prevents
saving a newly selected asset in `url` mode. Existing values are never rewritten merely because this
option changes. Previews resolve IDs against the current Directus `/assets/` path; paths and
absolute URLs preview directly. Editing an externally hosted image preserves its URL until a
Directus asset is selected.

The option applies to both editor image nodes and MDC image properties, with `path` as the single
default. This changes newly selected MDC image properties from the former ID default to an asset
path; existing stored values remain untouched. Video storage remains unchanged in this change.

## Migration sequence and acceptance criteria

1. Move components by role and repair imports without behavior changes.
2. Add `Field` and adapters, then migrate `ComponentPropsDrawer`, `LinkDrawer`, `MediaDrawer`, and
   applicable `ReferenceDrawer` controls. Remove duplicated labels and field-error markup. Retain
   workflow-specific notices and actions.
3. Verify keyboard focus, labels, error announcements, disabled controls, and no duplicate
   checkbox/image labels in the rendered drawers.
4. Verify insert/edit, metadata refresh, required and URL gating, numeric empty/finite values,
   select and multiselect round trips, image selection/clear in all three storage modes, link types,
   reference icon fallback, and source normalization consent.
5. Run `corepack pnpm format`, `corepack pnpm build:utils`, `corepack pnpm lint:fix`,
   `corepack pnpm typecheck`, `corepack pnpm test:unit`, `corepack pnpm build`, and
   `corepack pnpm validate:packages`; run focused component tests and packed-consumer checks if
   import or artifact behavior warrants them. Review the complete diff and `git diff --check`.

No dependency is needed. The new metadata hint and storage options change the public contract, so
update the package README and matching consumer skill. Add a scoped Changeset for the published
extension. The spec itself is documentation only.

## Subsequent recursive metadata expansion

The editor now accepts recursive `properties` and `items` in component metadata. Object properties
render as labeled dashed groups. Arrays of objects render repeatable groups with Add, drag reorder,
keyboard move controls, and confirmed Remove. Arrays with `values` remain multiselects; arrays
without `values` use a free-form string tag input with draggable chips. Nested required and URL
fields use dotted error paths, including row indexes. Nested objects and arrays persist in MDC
attributes as dynamic JSON bindings. The `icon` special input hint and its `config` are retained,
while its control remains a plain string input pending a dedicated icon picker.
