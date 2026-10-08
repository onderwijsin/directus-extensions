---
name: directus-ai-image-metadata-bundle
description: Configure Directus image metadata operations and backfills.
---

# Directus AI image metadata bundle

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
| `includeFolders`    | `[]`                             | Folder selection objects; empty selects all. Use `includeRoot` for root.                                |
| `excludeFolders`    | `[]`                             | Folder selection objects; exclusion wins. Use `excludeRoot` for root.                                   |
| `includeRoot`       | `false`                          | Include root files; alone restricts selection to root.                                                  |
| `excludeRoot`       | `false`                          | Exclude root files, overriding inclusion.                                                               |
| `generateTags`      | `false`                          | Write generated tags to directus_files.tags.                                                            |
| `generateFilename`  | `false`                          | Write a safe download filename, preserving its extension.                                               |
| `overwriteAltText`  | `false`                          | Replace populated description; otherwise fill only missing alt text.                                    |
| `overwriteTags`     | `false`                          | Replace populated tags when generateTags is enabled; otherwise fill only missing tags.                  |
| `overwriteFilename` | `false`                          | Replace the download filename when generateFilename is enabled; otherwise fill only a missing filename. |

Default image MIME selection: `image/jpeg`, `image/png`, `image/gif`, and `image/webp`. These are
common vision-model input formats. Check the configured provider/model's restrictions; for example,
OpenAI supports only non-animated GIF inputs. Other formats such as SVG, AVIF, TIFF, and HEIC are
excluded by default. Change `mimeTypes` only to formats your model supports. Original image bytes
are sent without conversion or rasterization; unsupported inputs produce classified failures
(single-file runs reject).

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
  "includeFolders": [
    { "key": "11111111-1111-4111-8111-111111111111", "collection": "directus_folders" }
  ]
}
```

The output is
`{ "results": [{ "id": "...", "status": "updated", "durationMs": 1200, "fields": ["description", "tags"] }] }`.
Skipped files return `status: "skipped"` and `fields: []`. No private image, credential, or provider
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
  "excludeRoot": true
}
```

An empty exhausted run returns an empty `results` array, `scanned: 0`, `nextOffset: null`,
`complete: true`, and a zero-count `summary`. Continue while `nextOffset` is non-null, then retry
failed IDs separately. `complete` remains false when any file failed, even after enumeration
exhausted. Keep selection/options unchanged across pages. Keep the matching file set stable during a
paged scan: concurrent additions, deletions, or changes to MIME/folder membership can shift offsets.
Restart from offset 0 with missingOnly enabled after such changes. Metadata writes do not change
query membership. For regeneration, set `missingOnly: false` and enable the overwrite control for
each field to replace. Tags and filename also require their generation options. For example,
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

Invalid options, unresolved shared provider configuration, and enumeration faults reject the Flow.
Single-file explicit runs still reject on file failure. Multi-file explicit runs and regeneration
isolate file failures: successful writes before and after a failure persist. Rejected errors are
masked; no arbitrary upstream message is returned. Each file update remains atomic.

## Troubleshooting

- Verify the provider/model and its image-input/structured-output support when generation fails.
- Check matching Directus credentials or environment keys when configuration is unavailable.
- Check Flow file permissions, MIME filters, exact folder selection, and populated metadata when
  files are skipped. Provider configuration is resolved lazily, so an entirely skipped run makes no
  provider calls.
- Reduce image size or explicitly adjust the byte limit when an image is too large.
- Keep backfill batches within your Flow execution timeout and provider budget. Run backfills
  serially. SQLite has database-level write locking; PostgreSQL supports per-row locks.

## Consumer workflow

1. Install the extension into a trusted supported Directus runtime and restart it.
2. Select an image-capable structured-output model; configure shared or extension environment
   settings and matching server-side credentials.
3. Configure a files.upload Flow with explicit IDs, or a manual backfill Flow with bounded batches.
4. Test a private image and confirm description/tags are written under the Flow permissions.
5. Review generated alt text, then wire description into the consuming site's image alt attributes.
6. For backfills, continue with nextOffset until complete; enable each overwrite control only when
   replacement is intended. Branch on summary.hasFailures for regeneration; keep a rejection branch
   for fatal errors.

For an OpenAI-compatible deployment, set AI_METADATA_WRITER_PROVIDER=openai-compatible,
AI_METADATA_WRITER_MODEL to a vision model, and AI_METADATA_WRITER_BASE_URL to the provider's API
base URL. Supply AI_METADATA_WRITER_API_KEY or the compatible Directus settings credential. Verify
that its chat-completions API supports both image messages and structured responses before backfill.

### Provider configuration errors

`AI_METADATA_WRITER_UNAVAILABLE` identifies missing or unsupported provider, missing model, missing
API key, or missing/invalid compatible-provider base URL using setting names without exposing
values. Both operations use the same configuration. Directus AI settings supply matching
credentials, but do not supply a default provider or model: set these in operation options,
`AI_METADATA_WRITER_PROVIDER` / `AI_METADATA_WRITER_MODEL`, or `DIRECTUS_EXTENSIONS_AI_PROVIDER` /
`DIRECTUS_EXTENSIONS_AI_MODEL`. Mistral credentials must come from environment configuration.

### Provider-bound configuration

Provider-sensitive inheritance is restricted to matching providers. A layer without a provider
belongs to the provider inherited from lower layers; lower-layer models, API keys, and base URLs
never acquire an overridden provider from above. When changing provider, supply a matching model and
credentials in that layer, another matching layer, or provider-matched Directus settings. Unbound
lower-layer credentials are not inherited.

### Requested metadata outputs

Alt text is always requested. Tags and filename are requested and validated only when `generateTags`
and `generateFilename` are enabled. Disabled fields are omitted from the output schema and discarded
if the model returns them, so malformed unused tags or filenames cannot fail alt-text-only
generation.

An empty or whitespace-only `DIRECTUS_EXTENSIONS_AI_API_KEY` environment value is treated as unset,
allowing startup without an AI key and provider-matched credential fallback. Generation still
requires a complete resolved configuration.

## Regeneration diagnostics

Regeneration returns `{summary, results, scanned, nextOffset, complete}`. Every result has `id`,
`status`, `durationMs`, and `fields`; failed results additionally have
`error: {stage, code, retryable, httpStatus?, message}`. Messages and codes are allowlisted. Stages
cover `read_file`, `resolve_provider`, `read_asset`, `read_bytes`, `convert_image`, `generate`, and
`write_metadata`; conversion is reserved for future format support. Fatal summaries may identify
`validate_options`, `enumerate`, or `shutdown`.

`filesFound` counts distinct fetched candidates, including the one-record continuation probe;
`filesAttempted` counts admitted files including skips. Updated/skipped/failed counts describe
settled outcomes. A fatal attempted file can have no settled result. Provider/model are null when no
eligible file resolved configuration. Summary options are null if validation failed. `durationMs`
uses a monotonic clock. Results retain selection order. Processing remains sequential:
`summary.options.concurrency` is always 1, not a configurable input in this patch.

`complete` means enumeration exhausted without file failures. A capped run has `complete: false`; a
partial failure also has `complete: false` even if `nextOffset: null`. Numeric offset semantics are
unchanged, not deprecated in this patch. Do not loop on `complete` alone: continue with a non-null
`nextOffset`, then retry failed IDs with the explicit-file operation after resolving the cause. The
scan does not persist a run record or mark failed files complete.

Connect the operation's resolve branch to a Condition inspecting
`<operation-key>.summary.hasFailures`: true handles partial failures; false handles successful runs.
Inspect `summary.complete` separately to determine whether further pages remain. The reject branch
handles fatal errors; a final partial summary is logged before rejection.

Each failed-file log includes run/file correlation, stage/code, duration, folder/MIME when known,
and resolved provider/model. Exactly one completion log includes the summary without results. The
logger receives structured fields, and sanitized JSON is embedded in the message so text log output
retains diagnostics. No prompts, credentials, raw exceptions, response bodies, image bytes, or
generated metadata are logged.

Asset acquisition now shares the per-file timeout; streams arriving after timeout are destroyed. AI
SDK generation retains two bounded retries with abort and supported Retry-After handling; no extra
retry loop or write retry is added. Retryability is advice for an explicit later retry, not a
guarantee of success. `PROVIDER_RATE_LIMITED` (429), `PROVIDER_UNAVAILABLE` (5xx),
`PROVIDER_REJECTED` (4xx), `INVALID_OUTPUT`, `FILE_INACCESSIBLE`, `INVALID_IMAGE`, `TIMEOUT`, and
stage-specific failures distinguish actionable causes without exposing upstream details.

### Complete success

```json
{
  "summary": {
    "runId": "5b4969d7-4e90-49e3-9e97-f47b832134d1",
    "operation": "ai-image-metadata-regenerate",
    "startedAt": "2026-10-08T07:02:00.000Z",
    "completedAt": "2026-10-08T07:02:01.000Z",
    "durationMs": 1000,
    "provider": "mistral",
    "model": "pixtral-large-latest",
    "options": {
      "maxFiles": 3,
      "concurrency": 1,
      "missingOnly": true,
      "includeFolders": [],
      "excludeFolders": [],
      "generateTags": false,
      "generateFilename": false,
      "overwriteAltText": false,
      "overwriteTags": false,
      "overwriteFilename": false
    },
    "filesFound": 1,
    "filesAttempted": 1,
    "filesUpdated": 1,
    "filesSkipped": 0,
    "filesFailed": 0,
    "outcome": "success",
    "hasFailures": false,
    "complete": true
  },
  "results": [
    {
      "id": "ee913870-cedc-4112-9f2e-0baaa9253fb0",
      "status": "updated",
      "durationMs": 990,
      "fields": ["description"]
    }
  ],
  "scanned": 1,
  "nextOffset": null,
  "complete": true
}
```

### Partial failure

```json
{
  "summary": {
    "runId": "5b4969d7-4e90-49e3-9e97-f47b832134d1",
    "operation": "ai-image-metadata-regenerate",
    "startedAt": "2026-10-08T07:02:00.000Z",
    "completedAt": "2026-10-08T07:02:01.000Z",
    "durationMs": 1000,
    "provider": "mistral",
    "model": "pixtral-large-latest",
    "options": {
      "maxFiles": 3,
      "concurrency": 1,
      "missingOnly": true,
      "includeFolders": [],
      "excludeFolders": [],
      "generateTags": false,
      "generateFilename": false,
      "overwriteAltText": false,
      "overwriteTags": false,
      "overwriteFilename": false
    },
    "filesFound": 2,
    "filesAttempted": 2,
    "filesUpdated": 1,
    "filesSkipped": 0,
    "filesFailed": 1,
    "outcome": "partial_failure",
    "hasFailures": true,
    "complete": false
  },
  "results": [
    {
      "id": "ee913870-cedc-4112-9f2e-0baaa9253fb0",
      "status": "updated",
      "durationMs": 990,
      "fields": ["description"]
    },
    {
      "id": "4c4e18d9-41ec-4cd5-a8cb-2d4e67520451",
      "status": "failed",
      "durationMs": 900,
      "fields": [],
      "error": {
        "stage": "generate",
        "code": "PROVIDER_RATE_LIMITED",
        "retryable": true,
        "httpStatus": 429,
        "message": "AI provider rate limit exceeded."
      }
    }
  ],
  "scanned": 2,
  "nextOffset": null,
  "complete": false
}
```

### Folder selection

Both operations show searchable **Include Folders** and **Exclude Folders** drawers with folder
names. The Studio user needs read permission on `directus_folders`, including `id` and `name`.
Execution continues to use the Flow accountability for file reads, assets, and writes. Matches are
exact, without descendants; exclusions win and duplicate selections are removed.

`includeFolders` and `excludeFolders` accept arrays of
`{"key":"11111111-1111-4111-8111-111111111111","collection":"directus_folders"}`. Clearing a drawer
saves null or an empty array, meaning no folder selections. `includeRoot` and `excludeRoot` are
explicit boolean controls, both default false. An empty include list with Include Root disabled
selects all folders, including root; Include Root alone restricts selection to root. Exclude Root
excludes root even when included. Keys must be UUIDs and the collection must be `directus_folders`;
malformed selections reject execution before side effects.

This replaces the previous UUID/string-array and null/root options. Existing Flows must replace UUID
strings with selection objects and use the root switches instead of null entries. No automatic
migration or legacy editor is provided. Reopen and save the operation with the new controls before
running it. A singular null now means an empty picker, not root.
