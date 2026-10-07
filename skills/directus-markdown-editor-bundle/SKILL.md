---
name: directus-markdown-editor-bundle
description: Set up and use the Directus Markdown Editor bundle.
---

# Directus Markdown Editor bundle

Use this guide when a consuming Directus project needs
`@onderwijsin/directus-markdown-editor-bundle`. Complete the applicable path and verify the stored
Markdown contract before declaring the integration ready.

## Establish the integration boundary

Confirm all of the following:

- Directus is `>=12.2.0 <13` and permits trusted non-sandboxed extensions.
- The package will be installed in the runtime that starts Directus, not only in a frontend.
- Each editor field is a Directus `text` or `string` field whose canonical value is Markdown.
- The consuming application owns Markdown/MDC rendering, component registration, styling,
  sanitization, media presentation, and Reference rendering.
- Component metadata is supplied as static interface JSON or through a browser-accessible JSON URL.
  Generating and transporting it is a project concern outside this package.

The bundle registers `markdown-editor-interface` and `markdown-editor-hook`. The hook makes the
bundle non-sandboxed. Do not add a parallel Tiptap JSON field.

## Install and load the bundle

Install the published package and restart Directus:

```sh
pnpm add @onderwijsin/directus-markdown-editor-bundle
```

For Docker, build it into the Directus image:

```dockerfile
FROM directus/directus:12.2.0

USER root
RUN corepack enable
USER node

RUN pnpm add @onderwijsin/directus-markdown-editor-bundle
```

```yaml
services:
  directus:
    build: .
    environment:
      MARKDOWN_EDITOR_ENABLED: 'true'
      MARKDOWN_EDITOR_DOCS_SEED_ENABLED: 'true'
	  MARKDOWN_EDITOR_SCHEMA_CHANGES_ENABLED: 'true'
	  EDITOR_AI_PROVIDER: 'openai'
	  EDITOR_AI_MODEL: 'your-model-id'
	  EDITOR_AI_API_KEY: 'replace-with-a-secret'
```

After restart, verify that **Markdown Editor** appears as an interface for `text` and `string`
fields. If it does not, inspect the Directus extension list/logs and confirm both bundle entries are
enabled.

## Configure a field

Create or select a `text`/`string` field and assign **Markdown Editor**. Configure every option:

| Option                                   | Default  | Accepted value and effect                                                                                                                                                                                                                                                                              |
| ---------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `tools` / **Available editor tools**     | `[]`     | JSON array of individual tool IDs. Controls toolbar, slash menu, contextual controls, insertion, and shortcuts. An empty array enables every tool. If no paragraph or heading level is selected, paragraph remains available; the block-type selector is hidden when only one block type is available. |
| `assetStorageMode` / **Store assets as** | `path`   | `id`, `path`, or `url` for newly selected Directus images in Markdown and MDC image properties. Existing image values are not rewritten.                                                                                                                                                               |
| `assetBaseUrl` / **Asset base URL**      | unset    | Required when `assetStorageMode` is `url`; use an HTTP(S) Directus base URL.                                                                                                                                                                                                                           |
| `useStaticComponentMeta`                 | `false`  | Boolean. Chooses `staticComponentMeta`; otherwise `metadataUrl` is used.                                                                                                                                                                                                                               |
| `metadataUrl`                            | unset    | Optional browser-accessible JSON URL. Hidden when static mode is enabled.                                                                                                                                                                                                                              |
| `staticComponentMeta`                    | unset    | Required JSON while static mode is enabled. No metadata request is made.                                                                                                                                                                                                                               |
| `useReferences`                          | `false`  | Boolean capability gate for Reference picking, editing, and integrity checks.                                                                                                                                                                                                                          |
| `referenceCollections`                   | unset    | Required non-empty JSON array while References are enabled.                                                                                                                                                                                                                                            |
| `enableReferenceIcon`                    | `false`  | Show an Iconify picker in the Reference drawer when References are enabled. Hidden icons in existing content are preserved.                                                                                                                                                                            |
| `iconifyCollections`                     | all      | Searchable static collection choices for Reference icons; an empty selection includes all. Component icon properties use their own tag config.                                                                                                                                                         |
| `useIconifyProxy`                        | `false`  | Request icons through `/iconify`. Requires `@onderwijsin/directus-iconify-bundle` installed in the same Directus instance; this editor does not register the endpoint.                                                                                                                                 |
| `referenceSnapshotMode`                  | `detect` | `snapshot`, `detect`, or `sync`.                                                                                                                                                                                                                                                                       |
| `ai` / **Enable AI editing**             | `false`  | Enables document, selection, and slash-menu insertion AI surfaces and authorizes field-context requests to `/editor/ai`.                                                                                                                                                                               |

## Configure AI editing

The startup hook creates the versioned `editor_skills` collection, including Directus created and
updated user/timestamp audit fields, when `MARKDOWN_EDITOR_SCHEMA_CHANGES_ENABLED=true`. Create
reusable records with a name, optional description/icon, one or more scopes (`document`,
`selection`, `insert`), a task prompt, `archived=false`, and an optional sort value. Do not create a
custom-prompt record: **Ask AI…** is built in.

Assign the seeded **Can Use Editor Skills** policy to editor roles that may invoke AI. It grants
create, read, and update access to `editor_skills`, intentionally not delete access. Execution
resolves the prompt with request accountability. Archived and scope-incompatible records are
rejected. Directus administrators may invoke the endpoint without an assigned policy.

Configure server-only provider values:

| Variable                                  | Default          | Meaning                                                                 |
| ----------------------------------------- | ---------------- | ----------------------------------------------------------------------- |
| `EDITOR_AI_PROVIDER`                      | shared value     | Local provider override: `openai`, `anthropic`, `google`, or `mistral`. |
| `EDITOR_AI_MODEL`                         | shared value     | Local provider-native model override.                                   |
| `EDITOR_AI_API_KEY`                       | shared/Directus  | Local secret override; never reaches Studio.                            |
| `EDITOR_AI_BASE_URL`                      | shared/default   | Local provider API base URL override.                                   |
| `DIRECTUS_EXTENSIONS_AI_PROVIDER`         | unset            | Shared provider fallback.                                               |
| `DIRECTUS_EXTENSIONS_AI_MODEL`            | unset            | Shared model fallback.                                                  |
| `DIRECTUS_EXTENSIONS_AI_API_KEY`          | Directus setting | Shared key before a matching Directus project credential.               |
| `DIRECTUS_EXTENSIONS_AI_BASE_URL`         | provider default | Shared provider API base URL.                                           |
| `EDITOR_AI_MAX_CONTENT_LENGTH`            | `100000`         | Positive request content limit.                                         |
| `MARKDOWN_EDITOR_SCHEMA_CHANGES_ENABLED`  | `true`           | Reconcile `editor_skills` at startup.                                   |
| `MARKDOWN_EDITOR_SCHEMA_ABORT_ON_ERROR`   | `true`           | Fail startup if reconciliation fails.                                   |
| `MARKDOWN_EDITOR_SKILLS_SEED_ENABLED`     | `true`           | Reconcile bundled editor skill seeds.                                   |
| `MARKDOWN_EDITOR_SKILLS_SEEDING_STRATEGY` | `versioning`     | Changed seeds use `versioning` or `override`.                           |

Resolve each value from the editor-specific variables first, then the shared
`DIRECTUS_EXTENSIONS_AI_*` variables. Without an explicit API key, the endpoint reuses the encrypted
Directus project credential matching OpenAI, Anthropic, or Google. Provider and model remain
explicit because Directus has no general default. Mistral requires an editor-specific or shared API
key. The internal credential read occurs only after authorization and never reaches Studio.

Skill seeds are owned by this Markdown hook and run in its coordinated documentation phase. This
keeps the catalog enabled when `DIRECTUS_EXTENSIONS_DATA_SEED_ENABLED=false`; that global switch
still disables ordinary policy and data seeds, but not documentation-phase skill reconciliation.
Each seed has a stable UUID. Missing seeds are created, unchanged seeds are skipped, and changed
seeds update the Directus **Incoming** version by default. Seed removal does not remove existing
records.

The built-in catalog includes Fix spelling and grammar, Improve clarity, Improve structure, Rewrite,
Shorten, Expand, and Turn into bullet points.

`POST /editor/ai` accepts authenticated JSON containing `scope`, `collection`, `field`, and exactly
one of `skillId` or `prompt`. Document and selection requests contain `content`; selection requests
also contain `{ from, to, text }`, with `text` equal to `content`. Insert requests instead contain
`{ position, document }`, where `document` is the complete current Markdown with one explicit
insertion marker. The target field must use interface `markdown-editor` with `ai: true`. The
response is `{ "content": string }`. Document output is reviewed before one undoable editor
replacement. Selection output opens a floating review panel below its target and replaces the
captured selection only after confirmation. Selection `content` retains Markdown structure and marks
rather than reducing them to plain text. Insert output is added at its requested position
immediately. Applying or inserting does not save the Directus item. Provider failure leaves the
field untouched.

AI appears first in the main and selection toolbars and in the drag-handle action menu. Drag-handle
controls align with the first visual line of paragraphs and headings, including wrapped text, and
stay near the top of container and media blocks. Drag-handle AI treats the complete current editor
node as a selection. The request includes normalized MDC component metadata, and the fixed system
prompt preserves the editor's Markdown/MDC syntax and input languages unless the task explicitly
requests translation. It treats code as literal by default. The fixed safety rules are combined with
a configuration-specific authoring section. Task, component-reference, and content messages remain
separate, and generated boundary whitespace is not trimmed automatically.

The `/` menu starts with an AI section. **Write with AI** is first, followed only by active skills
with the `insert` scope; insert skills do not appear on document, selection, or drag-handle
surfaces.

Image and video library selection is MIME-filtered to the matching media type. Selected images and
videos show a removable preview; video previews include native playback controls. Existing media
nodes expose **Edit image** or **Edit video** in the drag-handle action menu and reopen the same
media drawer used for insertion. The image drawer accepts optional alt text and stores it in image
Markdown; editing an image loads its current alt text. Videos fit within the editor and preview
width while retaining their natural size when smaller.

For metadata image and URL controls, use `{ "name": "specialInputType", "text": "image" }` or
`{ "name": "specialInputType", "text": "url" }` on a `string` property. The former `editor` tag
remains readable, with `specialInputType` taking precedence. The default image storage format is now
`/assets/{id}` for newly selected component images; existing ID values remain untouched.

The endpoint reads the target field's `tools`, selected component metadata source, and
`useReferences` options to construct the system prompt for that specific editor instance. AI may
introduce only currently enabled authoring syntax, while existing syntax remains preservation-safe
even when its corresponding toolbar action is disabled.

Treat provider data handling as an operator decision: document content and custom instructions leave
Directus for the configured provider/model. Keep credentials in environment secrets and grant skill
permissions only to trusted roles.

Valid tool IDs are:

```json
[
  "paragraph",
  "heading-1",
  "heading-2",
  "heading-3",
  "heading-4",
  "heading-5",
  "heading-6",
  "bold",
  "italic",
  "strike",
  "code",
  "blockquote",
  "code-block",
  "bullet-list",
  "ordered-list",
  "image",
  "video",
  "link",
  "horizontal-rule",
  "hard-break",
  "table",
  "clear-formatting",
  "history",
  "source",
  "fullscreen"
]
```

Leave the selection empty unless the content model deliberately restricts authors.

Component insertion is available whenever the selected metadata source provides components.
Reference insertion and integrity checks are controlled by `useReferences`. Both features are
independent of `tools`; saved `component` and `reference` tool IDs are ignored. Turning
`useReferences` off preserves stored Reference MDC.

The saved API value must remain a Markdown string:

```json
{
  "body": "# Welcome\n\n::Callout{tone=\"info\"}\n#default\nText\n::"
}
```

## Supply component metadata

Use this definitive input contract for both static and remote metadata. The root is either an array
or `{ "components": [...] }`.

```json
{
  "components": [
    {
      "name": "Callout",
      "label": "Callout",
      "description": "Highlight supporting content.",
      "nodeType": "block",
      "props": {
        "tone": {
          "name": "Tone",
          "type": "string",
          "description": "Visual emphasis.",
          "required": true,
          "default": "info",
          "values": ["info", "warning", "danger"]
        },
        "dismissible": {
          "name": "Dismissible",
          "type": "boolean",
          "default": false
        },
        "audiences": {
          "name": "Audiences",
          "type": "array",
          "values": ["students", "teachers", "parents"]
        },
        "image": {
          "name": "Image",
          "type": "string",
          "tags": [{ "name": "editor", "text": "image" }]
        }
      },
      "slots": ["default"]
    },
    {
      "name": "Icon",
      "nodeType": "inline",
      "props": [{ "name": "name", "type": "string", "required": true }],
      "slots": []
    }
  ]
}
```

### Validate component entries

| Field         | Requirement                                                                                |
| ------------- | ------------------------------------------------------------------------------------------ |
| `name`        | Required non-empty string. Exclude reserved name `Reference`; the editor filters it.       |
| `nodeType`    | Required `block` or `inline`. Any component with slots is inserted as a block.             |
| `label`       | Optional author-facing label; defaults to `name`.                                          |
| `description` | Optional selector help text.                                                               |
| `tags`        | Optional JSDoc tags; `deprecated` marks a supported component for urgent replacement.      |
| `props`       | Optional object keyed by property name or array of property definitions; defaults to `{}`. |
| `slots`       | Optional string array or array of objects containing non-empty `name`; defaults to `[]`.   |

For a property definition:

- `name` is required in array form and is an optional display label in object form;
- `type` supports `string`, `number`, `boolean`, `object`, and `array`; unknown legacy values fall
  back to text;
- a `string` with `values` renders a single select, while an `array` with `values` renders a
  multiselect;
- an `object` uses `properties` for nested fields in a labeled group;
- an `array` with object `items` renders repeatable property groups with add, drag reorder, keyboard
  move, and confirmed remove controls;
- an `array` without `values` or object `items` renders a free-form string tag input with draggable
  chips;
- `description` is optional help text;
- `required: true` blocks insertion while empty unless a default exists;
- `default` may contain a JSON-compatible initial value; and
- `values` is an optional array of string choices;
- `tags: [{ "name": "specialInputType", "text": "image" }]` (the JSON form of
  `@specialInputType image`) keeps a prop typed and persisted as a `string` while rendering a
  Directus image selector with a removable thumbnail; and
- `tags: [{ "name": "specialInputType", "text": "url" }]` (the JSON form of `@specialInputType url`)
  keeps a prop typed and persisted as a `string` while requiring a valid HTTP(S) URL with its
  protocol.

Primitive controls persist their matching JSON value types. The image hint persists a selected
Directus asset as an ID, `/assets/{id}` path, or absolute URL according to `assetStorageMode` (path
by default), never as a file object. Hints are carried as JSDoc tags so the metadata remains
compatible with `nuxt-component-meta`; arbitrary upstream tags and their optional `config` continue
to pass through unchanged. `@specialInputType` is the control namespace; `image` and `url` have
specialized controls. The `icon` hint renders an Iconify picker and reads its collection restriction
from `config.collections`, for example `{ "collections": ["lucide"] }`. Older `@editor` tags remain
readable, and `specialInputType` takes precedence if both are supplied. Nested required fields and
URL hints participate in Apply/Insert validation. Object and object-array values persist as
JSON-backed MDC attributes. Optional object fields may remain absent until edited.

- `tags` preserves JSDoc tags; `{ "name": "deprecated", "text": "Use newProp instead." }` displays a
  deprecation hint without changing runtime behavior.

Successfully loaded configured metadata is authoritative. The editor reports missing required
properties, required properties with empty persisted values, removed properties, added or removed
slots, deprecated components, and components absent from that metadata. A missing/failed metadata
source does not imply deletion. Stale/deprecated components use canvas warnings; absent components
use errors and expose only deletion. The scan never rewrites Markdown. In **Review**, header actions
appear only for applicable drift: **Refresh properties** preserves known values and removes obsolete
keys, while **Refresh slots** preserves supported slot content, removes unsupported slots/content,
and adds empty current slots. **Apply** is blocked until new required values are complete. Optional
property additions and deprecated properties are non-blocking hints. Component `tags` and property
`tags` both use the standard JSDoc shape. Deprecated components are labeled in both the component
picker and slash menu.

The schemas are loose: additional component/property fields survive validation but have no other
editor behavior. Refreshing newly added slots converts a legacy inline occurrence to a block because
inline MDC cannot contain slots; other metadata changes preserve its node type.

For remote metadata, ensure the Directus user’s browser can fetch the URL over HTTPS. Configure CORS
for the Studio origin and return JSON. Add the remote metadata host to Directus’s CSP `connect-src`
directive with `CONTENT_SECURITY_POLICY_DIRECTIVES__CONNECT_SRC` (see
[Directus CSP configuration](https://directus.com/docs/configuration/security-limits#csp)). The
editor adds no authentication header. Verify the endpoint in browser developer tools from the
deployed Studio origin. The process that derives or publishes this payload is outside this skill.

## Understand the MDC contract

Inline nodes use `:Name`; block nodes use `::Name`; named slots use `#slot` inside the block:

```text
Use :Icon{name="check"} inline.

::Hero{theme="dark"}
#title
Welcome
#description
Supporting **content**.
::
```

Block properties can use YAML:

```text
::Hero
---
theme: dark
layout: wide
---
#default
Content
::
```

The parser preserves escaped string quotes/backslashes, shorthand booleans, dynamic JSON bindings,
unknown component names, and nested delimiter depth. Dynamic bindings serialize with single outer
quotes, leaving object and array JSON in its standard double-quoted form. Empty inline nodes
serialize with `{}` to keep adjacent text separate. Bare inline syntax such as `:Icon` is recognized
only when currently loaded metadata identifies that name as an inline component. Ordinary colon text
such as `14:00 uur` or `list:with content` stays text. Explicit inline syntax (`:Name{}` or
`:Name{prop="value"}`) remains supported for unknown components, including when metadata is loading
or unavailable. Existing component nodes always serialize independently of metadata. Unknown bare
syntax remains text; use `{}` to make an unknown component explicit. Component slots are structural
editable regions; the editor prevents gap content between slots and focuses the first slot after
insertion.

Implement matching MDC renderers in the consumer and decide how unknown components are handled
safely. The editor does not provide frontend components.

## Configure Directus item References

References are inline snapshots, not Directus relations. Enable `useReferences` and configure unique
collections:

```json
[
  {
    "collection": "articles",
    "displayField": "title",
    "searchFields": ["title", "slug"],
    "dataFields": ["slug", "status", "category"]
  }
]
```

| Field          | Default          | Requirement                                                |
| -------------- | ---------------- | ---------------------------------------------------------- |
| `collection`   | required         | Direct collection identifier; each collection occurs once. |
| `displayField` | required         | Direct field copied to `label`.                            |
| `searchFields` | `[displayField]` | Direct `string`/`text` fields only.                        |
| `dataFields`   | `[]`             | Direct, non-relational fields copied to `data`.            |

Only identifiers containing letters, numbers, underscores, or hyphens are accepted. Nested paths,
wildcards, aliases, foreign keys, and M2O/O2M/M2M/M2A traversal are unsupported. The editor resolves
the actual primary key and de-duplicates repeated field names in order.

Grant the author role `read` permission for the configured collection, its primary key,
`displayField`, every `searchFields`/`dataFields` entry, and its archive field when present. All
reads use the current Studio API session. The extension uses no privileged token. A missing item and
an item hidden by permissions intentionally share the **Unavailable** state.

### Snapshot modes

| Mode       | Load behavior                                                                                                      |
| ---------- | ------------------------------------------------------------------------------------------------------------------ |
| `snapshot` | Resolve availability/archive state; do not report normal label/data drift until explicit refresh or replacement.   |
| `detect`   | Resolve sources, report stale snapshots, and offer occurrence-specific refresh/replace/remove actions.             |
| `sync`     | Refresh available stale `label`/`data` in one editor transaction. This dirties the field but never saves the item. |

Collection configuration changes trigger a fresh integrity scan. Removing a collection marks its
stored References as `unconfigured` without rewriting them. Changing `displayField` compares against
the newly selected label, and changing `dataFields` compares against the new snapshot field set. The
result follows the selected `snapshot`, `detect`, or `sync` behavior. Invalid configuration is
reported and never deletes stored References. Canvas nodes use warning styling for outdated/archived
states and error styling for unconfigured, unavailable, or unverifiable states.

Directus archive metadata is honored when both `archive_field` and `archive_value` exist. Archived
items are excluded from pickers, reported as **Archived**, and never refreshed by `sync`.

The stored contract is:

```md
:Reference{collection="articles" item="article-7" label="Becoming a teacher" text="this article"
icon="school" :data='{"slug":"becoming-a-teacher"}'}
```

- Required: `collection`, string/finite-number `item`, `label`, and JSON-compatible object `data`.
- Source-owned: `label` and `data`; refresh/sync may replace them.
- Author-owned: optional `text` and `icon`; refresh/sync/source replacement preserve them.
- Render `text ?? label` in the frontend; interpret `icon` only when included in that contract.

The integrity scan runs after hydration and full external replacements. It can report malformed,
unconfigured, unavailable, archived, outdated, and transient-error occurrences. It never updates the
source item, automatically saves the document, scans documents server-side, creates a reverse index,
or cascades source deletion.

## Resizable Markdown images

Drag the handle centered on an image's right edge to resize it while preserving its natural aspect
ratio. The chosen pixel width survives saving and reopening through Comark-compatible attributes:

```md
![Alt text](asset-id){width="420"}
```

Only width is persisted; height remains automatic. Images without a width retain the responsive
full-width default. Both states are constrained to the editor container. Remove the width attribute
in source mode, or drag the handle back to the container boundary, to return to full width. A small
snap zone at the boundary shows a dashed outline of the full-width target during dragging. The image
follows the pointer until release; releasing inside the active zone clears the stored width and
animates to full width. Resizing away from full width has no snap or animation. The release
animation is disabled when reduced motion is preferred. Invalid, zero, or negative widths use the
default state. Directus asset IDs remain unchanged in Markdown and resolve to asset URLs for editor
previews. Frontend image components should honor the width attribute and use
`max-width: 100%; height: auto;` to avoid overflow on narrower screens. Comark supports this
attribute syntax without a custom plugin.

## Configure editor documentation

Install the Studio Docs bundle when the seeded Dutch **Editor** article is required:

```sh
pnpm add @onderwijsin/directus-studio-docs-bundle
```

Configure its `studio_docs` collection and assign **Can View Studio Docs** or **Can Manage Studio
Docs** to the intended roles. This bundle contributes one stable article during startup.

| Variable                                | Default                 | Accepted value and behavior                                                                         |
| --------------------------------------- | ----------------------- | --------------------------------------------------------------------------------------------------- |
| `MARKDOWN_EDITOR_ENABLED`               | `true`                  | Boolean gate for the server hook/document contribution. It cannot unregister the browser interface. |
| `MARKDOWN_EDITOR_DOCS_SEED_ENABLED`     | `true`                  | Boolean contributor-specific article gate.                                                          |
| `DIRECTUS_EXTENSIONS_LOCK_PROVIDER`     | `SYNCHRONIZATION_STORE` | `memory`, `redis`, or `fs`; use a shared provider across replicas.                                  |
| `DIRECTUS_EXTENSIONS_LOCK_REDIS_URL`    | resolved Redis config   | Optional Redis URL override.                                                                        |
| `DIRECTUS_EXTENSIONS_LOCK_FS_DIRECTORY` | unset                   | Non-empty shared directory required for `fs`.                                                       |
| `SYNCHRONIZATION_STORE`                 | `memory`                | `memory` or `redis`; fallback when no dedicated provider is set.                                    |

The common schema also accepts `DIRECTUS_EXTENSIONS_SCHEMA_CHANGES_ENABLED`,
`DIRECTUS_EXTENSIONS_DATA_SEED_ENABLED`, and `DIRECTUS_EXTENSIONS_RATE_LIMITER_STORE`, but this
documentation callback is independent of the global schema/data gates and uses no rate limiter.
Redis can be supplied through the lock URL or Directus Redis configuration.

The Studio Docs bundle owns its enablement, seeding strategy, schema, and policy variables. With the
default `versioning` strategy, changed seeded content becomes the reserved `incoming` version;
review and promote it in Directus. Use `override` only when replacing current content is intended.

## Verify the integration

Complete every applicable check:

1. Restart Directus and confirm both bundle entries load without configuration errors.
2. Confirm **Markdown Editor** is selectable on a `text`/`string` field.
3. Save ordinary Markdown and read the item through the API; confirm the value is a string.
4. Insert one inline and one slotted block component and compare stored MDC with the renderer.
5. For remote metadata, test the request from the deployed Studio origin and verify CORS.
6. For References, test a normal, archived, missing, and permission-hidden item.
7. For Studio Docs, verify the article or review/promote its `incoming` version.
8. Confirm a restricted role sees only Reference collections and fields it may read.

## Troubleshoot deterministically

| Symptom                           | Resolve                                                                                                                                                                                                            |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Interface absent                  | Verify runtime installation, supported Directus version, enabled app entry, and restart.                                                                                                                           |
| Components absent                 | Verify the selected metadata source. The browser console logs the source URL and validation path on failure; a successful HTTP response can still contain invalid metadata. Verify the JSON schema and HTTPS/CORS. |
| Stored component has no metadata  | Restore its metadata entry to regain typed choices; generic editing remains available.                                                                                                                             |
| Reference configuration warning   | Check unique collections, primary keys, direct fields, search field types, and relation exclusion.                                                                                                                 |
| Reference picker empty            | Enter a query, verify author permissions, and check archive state.                                                                                                                                                 |
| Reference unavailable             | Treat as missing or permission-hidden; replace/remove it or correct permissions.                                                                                                                                   |
| Source mode requests confirmation | Compare normalization; accept only when the syntax change is intended.                                                                                                                                             |
| Studio article unchanged          | Inspect/promote `incoming`, then check contributor and Studio Docs seed gates.                                                                                                                                     |
| Startup lock errors               | Use shared Redis/filesystem storage and validate connection/directory access.                                                                                                                                      |

Keep metadata delivery in the consuming project. Do not add undocumented extension endpoints or
privileged browser credentials to transport it.
