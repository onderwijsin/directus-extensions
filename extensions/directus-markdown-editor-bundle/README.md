# @onderwijsin/directus-markdown-editor-bundle

A Directus-native Markdown and MDC editor for structured website content. The bundle combines the
**Markdown (MDC)** field interface with a startup hook that contributes an editor guide to the
optional Studio Docs module.

The editor stores portable Markdown in one `text` or `string` field. It does not store Tiptap JSON
and does not require a Nuxt runtime in Directus.

## Features

- headings, paragraphs, marks, lists, blockquotes, dividers, links, tables, images, video, and
  syntax-highlighted code blocks;
- keyboard shortcuts, a searchable `/` command menu, block drag handles, full-screen editing, and
  direct Markdown source editing;
- generic inline and block MDC components with typed properties and named editable slots;
- static or remotely loaded component metadata with one definitive JSON contract;
- hydration-time component property freshness reports with editor-controlled refresh;
- permission-aware Directus item references with source snapshots and integrity reporting; and
- an optional Dutch Studio Docs article for editors.

## Requirements

- Directus `>=12.2.0 <13`;
- Node.js `>=24.10.0` when managing the package outside the official Directus image;
- a trusted, self-hosted Directus runtime that permits non-sandboxed API extensions; and
- a `text` or `string` field for every Markdown document.

The server hook makes this a non-sandboxed bundle. It is not suitable for Directus environments that
permit only sandboxed extensions.

## Installation

Install the package in the same runtime that starts Directus, then restart Directus:

```sh
pnpm add @onderwijsin/directus-markdown-editor-bundle
```

For a Docker deployment, build a Directus image containing the extension:

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
```

Pin the Directus image to a version supported by the package and use your normal image update
process to upgrade. Directus loads the `markdown-editor-interface` app entry and
`markdown-editor-hook` API entry from the installed bundle.

## Quick start

1. Open **Settings → Data Model** and choose a collection.
2. Add a field with type **Text** or **String**.
3. Select the **Markdown (MDC)** interface.
4. Keep **Available editor tools** set to **All tools** for the first setup.
5. Save the field and open an item in the collection.

The API value remains a string:

```json
{
  "body": "# Welcome\n\nThis content was written in Directus."
}
```

Do not create a second field for Tiptap JSON. The Markdown string is the canonical value consumed by
your website or other application.

## Interface configuration

Configure these options on each field using the **Markdown (MDC)** interface.

| Option                            | Default   | Description                                                                                                                                                   |
| --------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Available editor tools**        | All tools | Selects the toolbar, `/` menu, block actions, insertion controls, and native shortcuts available on this field. An empty selection exposes no optional tools. |
| **Use static component metadata** | `false`   | Chooses static JSON instead of loading component metadata from a URL.                                                                                         |
| **Component metadata URL**        | unset     | Browser-accessible JSON URL used while static metadata is disabled.                                                                                           |
| **Static component metadata**     | unset     | Required JSON value while static metadata is enabled.                                                                                                         |
| **Use item references**           | `false`   | Enables the Reference picker, Reference editing, and document integrity checks.                                                                               |
| **Reference collections**         | unset     | Required non-empty JSON array when item references are enabled.                                                                                               |
| **Reference snapshot mode**       | `detect`  | Chooses `snapshot`, `detect`, or `sync` behavior for source snapshots.                                                                                        |

**Available editor tools** can independently expose paragraphs, heading levels 1–6, bold, italic,
strikethrough, inline code, blockquotes, code blocks, unordered and numbered lists, images, video,
links, references, dividers, hard breaks, tables, clear formatting, history, components, source
mode, and full-screen mode. Existing components and References remain readable when their insertion
tool is hidden. Existing components can still be configured; item-reference behavior additionally
requires **Use item references**.

## Component metadata contract

Component metadata tells the editor which MDC components authors can insert, which properties they
can configure, and which named slots they can edit. The contract is independent of any frontend
framework and accepts either an array or an object with a `components` array:

```json
{
  "components": [
    {
      "name": "Callout",
      "label": "Callout",
      "description": "Highlight important supporting content.",
      "nodeType": "block",
      "props": {
        "tone": {
          "name": "Tone",
          "type": "string",
          "description": "Visual emphasis used by the website.",
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

### Component fields

| Field         | Required | Contract                                                                                            |
| ------------- | -------- | --------------------------------------------------------------------------------------------------- |
| `name`        | yes      | Non-empty MDC component name. `Reference` is reserved and omitted from generic component insertion. |
| `nodeType`    | yes      | `block` or `inline`. Components with slots always insert as blocks.                                 |
| `label`       | no       | Editor-facing name; defaults to `name`.                                                             |
| `description` | no       | Editor-facing explanation shown during component selection.                                         |
| `tags`        | no       | JSDoc tags; `deprecated` marks a supported component for replacement or removal.                    |
| `props`       | no       | Object keyed by property name, or an array whose entries contain `name`; defaults to `{}`.          |
| `slots`       | no       | Array of slot-name strings or `{ "name": "..." }` objects; defaults to `[]`.                        |

### Property fields

| Field         | Required           | Contract                                                                                   |
| ------------- | ------------------ | ------------------------------------------------------------------------------------------ |
| `name`        | only in array form | Property key in array form; optional editor-facing label in object form.                   |
| `type`        | no                 | Editor input hint. `boolean` renders a checkbox; other values render text/select controls. |
| `description` | no                 | Help text for the property.                                                                |
| `required`    | no                 | Prevents insertion until the author supplies a value; defaults to `false`.                 |
| `default`     | no                 | Initial JSON-compatible value applied during insertion.                                    |
| `values`      | no                 | Allowed string choices shown as a select control.                                          |
| `tags`        | no                 | JSDoc tags from component metadata; `deprecated` adds an editor hint and optional message. |

When a static value or metadata URL loads successfully, the editor treats that metadata as
authoritative and checks components after hydration. Missing required properties, required
properties whose persisted value is empty, removed properties, and added or removed slots produce an
attention report and warning styling in the canvas. Components absent from authoritative metadata
use error styling and expose deletion as their only action. A missing or failed metadata source is
not interpreted as component deletion.

The scan never rewrites Markdown. **Review** opens the component drawer. **Refresh properties** is
shown in the header only for property drift; it preserves known values, applies defaults, and
removes obsolete properties. **Refresh slots** preserves supported slot content, removes unsupported
slots and their content, and adds empty current slots. Changes are persisted only after **Apply**,
which is blocked while required values are empty. Optional property additions do not create
attention items.

Components and properties carrying a standard JSDoc `deprecated` tag remain functional and display a
Deprecated hint. Deprecated components are labeled in both insertion menus and appear in the report
and canvas as warnings so authors can replace or remove them. A deprecated property remains a UI
hint only. Tag `text` is shown as migration guidance when supplied; no separate `deprecated` field
is used.

Additional component and property fields are retained by validation but are not otherwise
interpreted by the current editor. Refreshing newly added slots converts a legacy inline occurrence
to a block because inline MDC cannot contain slots; other metadata changes preserve its node type.

When using **Component metadata URL**, the Directus user’s browser fetches the URL. Serve valid JSON
over HTTPS with CORS headers that allow the Studio origin. Authentication headers are not added by
the editor. How a frontend generates, publishes, or transports this metadata is intentionally
outside this package; static JSON and the URL are equivalent inputs to the same contract.

## MDC storage examples

Inline components use one colon and block components use two:

```text
Read the :Badge{tone="info"} before continuing.

::Callout{tone="warning"}
#default
Remember to publish your changes.
::
```

Named slots remain editable regions:

```text
::Hero
#title
Welcome to our website
#description
Supporting **Markdown** for the introduction.
::
```

YAML properties are supported for block components:

```text
::Hero
---
theme: dark
layout: wide
---
#default
Hero content
::
```

String attributes preserve escaped quotes and backslashes. Shorthand booleans and dynamic JSON
bindings preserve their value types. Unknown component names remain generic MDC nodes so stored
content is not tied to the current metadata list.

## Item references

References let authors select Directus items without creating a relational field. They are inline
MDC snapshots, not database relations.

Enable **Use item references**, keep the **Reference** editor tool enabled, and configure direct
fields only:

```json
[
  {
    "collection": "articles",
    "displayField": "title",
    "searchFields": ["title", "slug"],
    "dataFields": ["slug", "status", "category"]
  },
  {
    "collection": "programs",
    "displayField": "name",
    "dataFields": ["slug", "type"]
  }
]
```

| Field          | Default          | Contract                                                                     |
| -------------- | ---------------- | ---------------------------------------------------------------------------- |
| `collection`   | required         | Unique Directus collection name.                                             |
| `displayField` | required         | Direct field used as the stored source label.                                |
| `searchFields` | `[displayField]` | Direct `string` or `text` fields searched with case-insensitive containment. |
| `dataFields`   | `[]`             | Direct fields copied into the stored source snapshot.                        |

Changing this configuration triggers a new integrity scan. Removing a configured collection marks
its persisted References as **Not configured** without rewriting them. Changing `displayField`
compares stored labels with the newly selected field, while changing `dataFields` compares the
stored data object with the newly selected field set. In `detect` mode differences are reported as
outdated; `sync` updates available snapshots in one editor transaction; `snapshot` leaves snapshot
values unchecked. Invalid collection configuration is reported without deleting stored References.
Outdated and archived References use warning styling in the canvas; unconfigured, unavailable, and
unverifiable References use error styling.

The editor discovers the real primary key and requests only the configured projection plus the
archive field configured on the collection. Nested fields, wildcards, aliases, foreign keys, and
relation traversal are rejected. Duplicate collection entries are invalid. Give Studio authors
`read` access to the configured collection, primary key, display field, search fields, data fields,
and archive field.

Snapshot modes behave as follows:

| Mode       | Behavior when a document loads                                                                                    |
| ---------- | ----------------------------------------------------------------------------------------------------------------- |
| `snapshot` | Verifies availability and archive state without reporting ordinary snapshot differences.                          |
| `detect`   | Verifies sources and reports changed labels/data so the author can refresh them.                                  |
| `sync`     | Refreshes changed labels/data in one editor transaction; the item becomes dirty but is never saved automatically. |

A stored Reference looks like this:

```md
:Reference{collection="articles" item="article-7" label="Becoming a teacher" text="this article"
icon="school" :data="{\"slug\":\"becoming-a-teacher\"}"}
```

`collection`, `item`, `label`, and object `data` are required on new References. `item` can be a
string or finite number. `label` and `data` belong to the source snapshot. Optional `text` and
`icon` belong to the author and survive refresh, synchronization, and source replacement. Consumer
renderers should display `text ?? label`.

Archived items are omitted from search and reported as **Archived** when still readable. Missing
items and permission-hidden items are both reported as **Unavailable**. The editor never uses an
administrator token, changes the source item, saves the containing item automatically, or creates a
reverse index.

## Code blocks and media

Code blocks use Shiki’s light and dark GitHub themes. Authors can choose a supported language, add a
filename/path, and mark a block as collapsible. Stored Markdown remains compatible with Nuxt
Content-style fences:

````md
```ts [app/nuxt.config.ts]
export default defineNuxtConfig({})
```
````

Collapsible code uses an MDC `::code-collapse` wrapper. Inside code blocks, Tab and Shift-Tab
indent/outdent and Enter preserves indentation.

Images and video can be selected from the Directus file library or entered as HTTP(S), relative, or
`/assets/{id}` URLs. Executable and data protocols are rejected. The extension does not transform
images, generate captions, or provide a frontend media renderer.

## Studio Docs article

Install `@onderwijsin/directus-studio-docs-bundle` when editors should receive the bundled Dutch
guide in Studio:

```sh
pnpm add @onderwijsin/directus-studio-docs-bundle
```

The Studio Docs bundle provisions `studio_docs` and its policies. Assign its view or manage policy
to the appropriate roles. This bundle contributes the stable **Editor** article during the
documentation startup phase.

| Environment variable                    | Default                        | Description                                                                                                           |
| --------------------------------------- | ------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| `MARKDOWN_EDITOR_ENABLED`               | `true`                         | Enables the Markdown Editor server hook and its documentation contribution. The browser interface remains registered. |
| `MARKDOWN_EDITOR_DOCS_SEED_ENABLED`     | `true`                         | Enables contribution of the Editor article.                                                                           |
| `DIRECTUS_EXTENSIONS_LOCK_PROVIDER`     | `SYNCHRONIZATION_STORE`        | Startup lock: `memory`, `redis`, or `fs`. Use a shared provider for multiple Directus processes.                      |
| `DIRECTUS_EXTENSIONS_LOCK_REDIS_URL`    | resolved Directus Redis config | Optional Redis URL override for the startup lock.                                                                     |
| `DIRECTUS_EXTENSIONS_LOCK_FS_DIRECTORY` | unset                          | Required with the `fs` provider; all processes must share the directory.                                              |
| `SYNCHRONIZATION_STORE`                 | `memory`                       | Shared fallback store: `memory` or `redis`.                                                                           |

The hook accepts the shared schema/data and rate-limiter environment values through the common
startup schema, but its documentation phase is independent of the global schema and data gates. See
the Studio Docs bundle configuration for seeding strategy, schema provisioning, and policy controls.
With its default `versioning` strategy, changed article content is written to the `incoming` version
for review rather than replacing the published article.

## Security and operational boundaries

- Install the bundle only in a trusted Directus runtime.
- Treat remote component metadata as trusted authoring configuration and serve it over HTTPS.
- Reference searches use the signed-in Studio user’s API session and Directus permissions.
- Source mode warns when applying Markdown would normalize or remove unsupported syntax and requires
  explicit confirmation.
- Frontend rendering, component registration, styling, content sanitization, and Reference
  resolution are responsibilities of the consuming application.
- The package does not generate component metadata, inspect a frontend project, provision content
  collections, assign roles, or save edited Directus items automatically.

## Troubleshooting

| Symptom                              | Check                                                                                                                |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| **Markdown (MDC)** is missing        | Confirm the package is installed in the Directus runtime, the app entry is enabled, and Directus was restarted.      |
| Component insertion is missing       | Enable the **Component insert** tool and provide valid static metadata or a reachable metadata URL.                  |
| Remote metadata fails                | Check HTTPS, CORS, JSON validity, and browser network errors. The endpoint receives no custom authentication header. |
| A Reference collection is disabled   | Check collection uniqueness, direct field names, primary-key metadata, field types, and relational fields.           |
| Authors cannot find a Reference item | Check their read permissions and whether the item is archived. Search starts after text is entered.                  |
| A Reference is unavailable           | The source is missing or hidden by permissions; replace or remove it from the integrity report.                      |
| Updated Studio docs are not visible  | Inspect the `incoming` content version when the Studio Docs seeding strategy is `versioning`.                        |
| Startup reports a lock skip/error    | Configure Redis or a shared filesystem lock for multi-process deployments.                                           |

## License

MIT
