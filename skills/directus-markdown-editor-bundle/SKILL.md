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
```

After restart, verify that **Markdown (MDC)** appears as an interface for `text` and `string`
fields. If it does not, inspect the Directus extension list/logs and confirm both bundle entries are
enabled.

## Configure a field

Create or select a `text`/`string` field and assign **Markdown (MDC)**. Configure every option:

| Option                               | Default   | Accepted value and effect                                                                                                                                                           |
| ------------------------------------ | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tools` / **Available editor tools** | `["all"]` | JSON array containing `all` or individual tool IDs. Controls toolbar, slash menu, contextual controls, insertion, and shortcuts. An empty array enables none of the optional tools. |
| `useStaticComponentMeta`             | `false`   | Boolean. Chooses `staticComponentMeta`; otherwise `metadataUrl` is used.                                                                                                            |
| `metadataUrl`                        | unset     | Optional browser-accessible JSON URL. Hidden when static mode is enabled.                                                                                                           |
| `staticComponentMeta`                | unset     | Required JSON while static mode is enabled. No metadata request is made.                                                                                                            |
| `useReferences`                      | `false`   | Boolean capability gate for Reference picking, editing, and integrity checks.                                                                                                       |
| `referenceCollections`               | unset     | Required non-empty JSON array while References are enabled.                                                                                                                         |
| `referenceSnapshotMode`              | `detect`  | `snapshot`, `detect`, or `sync`.                                                                                                                                                    |

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
  "reference",
  "horizontal-rule",
  "hard-break",
  "table",
  "clear-formatting",
  "history",
  "component",
  "source",
  "fullscreen"
]
```

Use `all` unless the content model deliberately restricts authors. Hiding `component` preserves
settings for stored components. Hiding `reference` preserves stored Reference MDC; turning
`useReferences` off removes Reference-specific UI and integrity checks.

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
- `type: "boolean"` selects a checkbox; other types use text/select input behavior;
- `description` is optional help text;
- `required: true` blocks insertion while empty unless a default exists;
- `default` may contain a JSON-compatible initial value; and
- `values` is an optional array of string choices.
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
for the Studio origin and return JSON. The editor adds no authentication header. Verify the endpoint
in browser developer tools from the deployed Studio origin. The process that derives or publishes
this payload is outside this skill.

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
unknown component names, and nested delimiter depth. Empty inline nodes serialize with `{}` to keep
adjacent text separate. Component slots are structural editable regions; the editor prevents gap
content between slots and focuses the first slot after insertion.

Implement matching MDC renderers in the consumer and decide how unknown components are handled
safely. The editor does not provide frontend components.

## Configure Directus item References

References are inline snapshots, not Directus relations. Enable `useReferences`, include `reference`
in `tools` (or use `all`), and configure unique collections:

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
icon="school" :data="{\"slug\":\"becoming-a-teacher\"}"}
```

- Required: `collection`, string/finite-number `item`, `label`, and JSON-compatible object `data`.
- Source-owned: `label` and `data`; refresh/sync may replace them.
- Author-owned: optional `text` and `icon`; refresh/sync/source replacement preserve them.
- Render `text ?? label` in the frontend; interpret `icon` only when included in that contract.

The integrity scan runs after hydration and full external replacements. It can report malformed,
unconfigured, unavailable, archived, outdated, and transient-error occurrences. It never updates the
source item, automatically saves the document, scans documents server-side, creates a reverse index,
or cascades source deletion.

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
2. Confirm **Markdown (MDC)** is selectable on a `text`/`string` field.
3. Save ordinary Markdown and read the item through the API; confirm the value is a string.
4. Insert one inline and one slotted block component and compare stored MDC with the renderer.
5. For remote metadata, test the request from the deployed Studio origin and verify CORS.
6. For References, test a normal, archived, missing, and permission-hidden item.
7. For Studio Docs, verify the article or review/promote its `incoming` version.
8. Confirm a restricted role sees only Reference collections and fields it may read.

## Troubleshoot deterministically

| Symptom                           | Resolve                                                                                            |
| --------------------------------- | -------------------------------------------------------------------------------------------------- |
| Interface absent                  | Verify runtime installation, supported Directus version, enabled app entry, and restart.           |
| Components absent                 | Verify `component` tool, selected metadata source, JSON schema, HTTPS/CORS, and browser console.   |
| Stored component has no metadata  | Restore its metadata entry to regain typed choices; generic editing remains available.             |
| Reference configuration warning   | Check unique collections, primary keys, direct fields, search field types, and relation exclusion. |
| Reference picker empty            | Enter a query, verify author permissions, and check archive state.                                 |
| Reference unavailable             | Treat as missing or permission-hidden; replace/remove it or correct permissions.                   |
| Source mode requests confirmation | Compare normalization; accept only when the syntax change is intended.                             |
| Studio article unchanged          | Inspect/promote `incoming`, then check contributor and Studio Docs seed gates.                     |
| Startup lock errors               | Use shared Redis/filesystem storage and validate connection/directory access.                      |

Keep metadata delivery in the consuming project. Do not add undocumented extension endpoints or
privileged browser credentials to transport it.
