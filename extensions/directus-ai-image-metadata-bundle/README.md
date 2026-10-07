# `@onderwijsin/directus-ai-image-metadata-bundle`

Generate accessible image alt text, optional tags, and optional download filenames from Directus
Flows using the Vercel AI SDK. Includes `ai-image-metadata` for explicit files and
`ai-image-metadata-regenerate` for manual, resumable batches. Private assets are read through
Directus; they do not need public URLs.

## Install

Install the package in your extension build stage, then copy its `package.json` and `dist/` into
`/directus/extensions/directus-ai-image-metadata-bundle` and restart Directus:

```sh
pnpm add @onderwijsin/directus-ai-image-metadata-bundle
```

Requires Directus `>=12.2.0 <13` and Node.js `>=24.10.0`. This is a non-sandboxed extension for a
trusted Directus installation. Environments allowing only sandboxed API extensions cannot load it.
It registers two operations; it creates no collections, fields, hooks, or default Flows.

## Provider configuration

Choose a model that supports **image input and structured output**. Supported adapters are `openai`,
`anthropic`, `google`, `mistral`, and `openai-compatible`. Image capability depends on the selected
model and provider; it cannot be inferred from the provider name. Unsupported input or output is
reported through the Flow rejection branch.

Resolution is per field: operation `provider`/`model`, extension environment, shared environment,
then provider-matched Directus credentials. Directus settings supply credentials, not a default
provider/model. The provider and model must be configured in one of the higher layers. Credentials
never appear in operation results or Studio options. API keys should be configured in the
environment or Directus settings, rather than stored in Flow options.

| Environment variable                 | Type / default                                | Meaning                                                                                        |
| ------------------------------------ | --------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `AI_METADATA_WRITER_ENABLED`         | boolean, `true`                               | `false` disables both handlers; they return `null` before validation or service access.        |
| `AI_METADATA_WRITER_PROVIDER`        | supported provider, unset                     | Extension provider override.                                                                   |
| `AI_METADATA_WRITER_MODEL`           | string, unset                                 | Extension model override.                                                                      |
| `AI_METADATA_WRITER_API_KEY`         | string, unset                                 | Server-only API key override.                                                                  |
| `AI_METADATA_WRITER_BASE_URL`        | URL, unset                                    | Provider endpoint override. Required for `openai-compatible` unless supplied by a lower layer. |
| `AI_METADATA_WRITER_LANGUAGE`        | accepted language, `English`                  | Global language for generated alt text, tags, and filename words.                              |
| `AI_METADATA_WRITER_PROMPT`          | Markdown string, default accessibility prompt | Replacement system instructions; blank uses the default.                                       |
| `AI_METADATA_WRITER_MAX_IMAGE_BYTES` | positive integer, `10000000`                  | Maximum bytes read into memory per image.                                                      |
| `AI_METADATA_WRITER_TIMEOUT_MS`      | positive integer, `60000`                     | Timeout for image streaming and generation.                                                    |
| `DIRECTUS_EXTENSIONS_AI_PROVIDER`    | string, unset                                 | Shared provider fallback; must be a supported adapter when used here.                          |
| `DIRECTUS_EXTENSIONS_AI_MODEL`       | string, unset                                 | Shared model fallback.                                                                         |
| `DIRECTUS_EXTENSIONS_AI_API_KEY`     | nonblank string, unset                        | Shared server-only credential fallback.                                                        |
| `DIRECTUS_EXTENSIONS_AI_BASE_URL`    | URL, unset                                    | Shared endpoint fallback.                                                                      |

Directus credential fields are `ai_openai_api_key`, `ai_anthropic_api_key`, `ai_google_api_key`, and
`ai_openai_compatible_api_key`; the compatible provider also reuses `ai_openai_compatible_base_url`.
Mistral requires an environment credential. Credentials are read internally with an unaccountable
SettingsService for decryption, and never returned to clients. File reads, asset access, and updates
use the **Flow execution accountability**.

```dotenv
DIRECTUS_EXTENSIONS_AI_PROVIDER=openai
DIRECTUS_EXTENSIONS_AI_MODEL=your-vision-model
# Configure ai_openai_api_key in Directus settings, or set a server-only environment key.
AI_METADATA_WRITER_MAX_IMAGE_BYTES=10000000
AI_METADATA_WRITER_TIMEOUT_MS=60000
AI_METADATA_WRITER_LANGUAGE=Dutch
```

Directus type-casts environment values. Use `string:` when necessary for model identifiers and
Markdown prompt values. Configure provider base URLs only with trusted administrative configuration.
Images are sent to the selected external AI provider; account for that provider's data policy.

## Operation options

Both operations accept these options. Cleared optional Studio strings (null or empty) use their
environment/default fallback:

| Option              | Default                          | Behavior                                                                                                |
| ------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `language`          | environment language / `English` | Optional language override for this operation.                                                          |
| `provider`          | `resolved environment`           | Provider override; credentials stay on the server.                                                      |
| `model`             | `resolved environment`           | Image-capable model override.                                                                           |
| `prompt`            | `environment/default`            | Replacement system instructions.                                                                        |
| `mimeTypes`         | JPEG, PNG, GIF, WebP             | Exact MIME string or nonempty array; normalized to lowercase. Non-images are skipped.                   |
| `includeFolders`    | `[]`                             | Exact folder UUID or array; empty selects all. Null includes root; descendants are not implicit.        |
| `excludeFolders`    | `[]`                             | Exact folder UUID or array; exclusion wins. Null excludes root.                                         |
| `generateTags`      | `false`                          | Write generated tags to directus_files.tags.                                                            |
| `generateFilename`  | `false`                          | Write a safe download filename, preserving its extension.                                               |
| `overwriteAltText`  | `false`                          | Replace populated description; otherwise fill only missing alt text.                                    |
| `overwriteTags`     | `false`                          | Replace populated tags when generateTags is enabled; otherwise fill only missing tags.                  |
| `overwriteFilename` | `false`                          | Replace the download filename when generateFilename is enabled; otherwise fill only a missing filename. |

Default image MIME selection: `image/jpeg`, `image/png`, `image/gif`, and `image/webp`. These are
common vision-model input formats. Check the configured provider/model's restrictions; for example,
OpenAI supports only non-animated GIF inputs. Other formats such as SVG, AVIF, TIFF, and HEIC are
excluded by default. Change `mimeTypes` only to formats your model supports. Original image bytes
are sent without conversion or rasterization; unsupported inputs reject through the Flow error
branch.

The Studio shows **Overwrite Tags** only when **Generate Tags** is enabled, and **Overwrite
Filename** only when **Generate Download Filename** is enabled. Disabling generation hides its
overwrite control and prevents writes for that field, even if a previously saved overwrite value is
true.

Alt text is written to `directus_files.description`. Consumers must map that value to rendered image
alt attributes; the extension does not modify frontend rendering. Whitespace-only descriptions and
filenames, null tags, empty tag strings, and arrays without nonblank tags count as missing.
Populated fields are preserved individually and rechecked under a database row lock before updates.
Generated tags are deduplicated. Physical storage filenames and file titles are unchanged. Uploaded
files normally already have `filename_download`, so renaming them requires `generateFilename: true`
and `overwriteFilename: true`. Alt text and tags retain their independent overwrite policies.

Default instructions request concise descriptions of meaningful visible content, relevant visible
text, no “Image of”/“Picture of” prefixes, and no invented identities or context. Custom prompts
replace those instructions. Responses are validated: nonblank alt text up to 1000 characters, up to
30 tags of 100 characters, and a lowercase hyphenated filename stem up to 150 characters. Human
review remains appropriate before using generated descriptions for accessibility.

### Metadata language

Accepted language values (case-sensitive): English, Dutch, German, French, Spanish, Italian,
Portuguese, Danish, Swedish, Norwegian, Finnish, Polish, Czech, Greek, Romanian, Hungarian, Turkish,
Ukrainian, Russian, Arabic, Hindi, Chinese, Japanese, and Korean.

The operation's `language` overrides `AI_METADATA_WRITER_LANGUAGE`, which defaults to `English`.
Omitted, null, or empty operation values use the global default. Unsupported languages are rejected
by environment or operation validation. The effective language is appended to every system prompt,
including custom prompts; it takes precedence over conflicting language instructions in that prompt.
Alt text, tags, and descriptive filename words use that language. Filenames remain lowercase ASCII
slugs, with transliteration where necessary. Existing populated fields still follow their
independent overwrite controls; changing the language does not translate preserved metadata.

For example, set `AI_METADATA_WRITER_LANGUAGE=Dutch` globally and use `"language": "French"` in an
operation to generate French metadata for those files. To regenerate existing alt text in French,
set `"overwriteAltText": true` too; a backfill also needs `"missingOnly": false`.

### Explicit files

`ai-image-metadata` additionally requires `files`: a UUID or an array of 1–1000 UUIDs. Duplicate IDs
are processed once. Files run sequentially. For a `files.upload` event Flow, use `{{$trigger.key}}`
as the file ID. For a manual multi-file trigger, pass its selected keys.

```json
{
  "files": "{{$trigger.key}}",
  "language": "Dutch",
  "generateTags": true,
  "includeFolders": ["11111111-1111-4111-8111-111111111111"]
}
```

The output is
`{ "results": [{ "id": "...", "status": "updated", "fields": ["description", "tags"] }] }`. Skipped
files return `status: "skipped"` and `fields: []`. No private image, credential, or provider
response is included.

### Manual backfill

`ai-image-metadata-regenerate` adds:

| Option        | Default | Behavior                                                                                                |
| ------------- | ------- | ------------------------------------------------------------------------------------------------------- |
| `missingOnly` | `true`  | Only generate when at least one requested field is missing.                                             |
| `maxFiles`    | `100`   | Scan 1–1000 MIME/folder-matched, readable files per invocation. Complete files count toward this limit. |
| `offset`      | `0`     | Nonnegative scan offset; resume with the preceding output's `nextOffset` in ascending ID order.         |

```json
{
  "generateTags": true,
  "missingOnly": true,
  "maxFiles": 100,
  "excludeFolders": [null]
}
```

Returns `{ "results": [], "scanned": 0, "nextOffset": null, "complete": true }` when no files
remain. Continue with the returned `nextOffset` as `offset` until `complete` is true. Keep
selection/options unchanged across pages. Keep the matching file set stable during a paged scan:
concurrent additions, deletions, or changes to MIME/folder membership can shift offsets. Restart
from offset 0 with missingOnly enabled after such changes. Metadata writes do not change query
membership. For regeneration, set `missingOnly: false` and enable the overwrite control for each
field to replace. Tags and filename also require their generation options. For example,
`generateTags: true`, `overwriteTags: true`, and `missingOnly: false` replaces existing tags while
preserving populated alt text and filenames. `missingOnly: false` alone still preserves populated
fields. To generate only missing alt text, leave optional fields disabled; enable `generateTags` to
also find files missing tags.

## Permissions, errors, and operation lifecycle

The Flow must have read access to image records/assets and update access to the requested file
fields. Configure the Flow accountability accordingly. Settings access is privileged solely for
server-side credential resolution; file access is never elevated by this extension. Metadata writes
use Directus internal services and emit normal Directus update events. Avoid a Flow that recursively
invokes these operations on their own `files.update` events.

Invalid options, empty images, and excessive image size reject with `INVALID_PAYLOAD`.
Incomplete/unsupported provider configuration rejects with `AI_METADATA_WRITER_UNAVAILABLE`.
Provider failures and malformed output reject with `AI_METADATA_WRITER_GENERATION_FAILED`. Existing
Directus service/permission errors are preserved. Unknown internal failures are masked; provider
response bodies and credentials are not logged. Each file update is atomic, but a batch is not one
transaction: successful earlier files remain updated if a later file fails. Connect a Flow rejection
branch; rerun a missing-only backfill to resume safely after addressing a failure.

## Troubleshooting

- Verify the provider/model and its image-input/structured-output support when generation fails.
- Check matching Directus credentials or environment keys when configuration is unavailable.
- Check Flow file permissions, MIME filters, exact folder selection, and populated metadata when
  files are skipped. Provider configuration is resolved lazily, so an entirely skipped run makes no
  provider calls.
- Reduce image size or explicitly adjust the byte limit when an image is too large.
- Keep backfill batches within your Flow execution timeout and provider budget. Run backfills
  serially. SQLite has database-level write locking; PostgreSQL supports per-row locks.

### Provider configuration errors

`AI_METADATA_WRITER_UNAVAILABLE` identifies missing or unsupported provider, missing model, missing
API key, or missing/invalid compatible-provider base URL using setting names without exposing
values. Both operations use the same configuration. Directus AI settings supply matching
credentials, but do not supply a default provider or model: set these in operation options,
`AI_METADATA_WRITER_PROVIDER` / `AI_METADATA_WRITER_MODEL`, or `DIRECTUS_EXTENSIONS_AI_PROVIDER` /
`DIRECTUS_EXTENSIONS_AI_MODEL`. Mistral credentials must come from environment configuration.
