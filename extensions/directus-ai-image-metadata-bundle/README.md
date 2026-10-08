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

Both operations accept these options. Cleared optional Studio strings (null, empty, or
whitespace-only) use their environment/default fallback:

| Option              | Default                          | Behavior                                                                                                |
| ------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `language`          | environment language / `English` | Optional language override for this operation.                                                          |
| `provider`          | `resolved environment`           | Provider override; credentials stay on the server.                                                      |
| `model`             | `resolved environment`           | Image-capable model override.                                                                           |
| `prompt`            | `environment/default`            | Replacement system instructions.                                                                        |
| `mimeTypes`         | JPEG, PNG, GIF, WebP             | Exact MIME string or nonempty array; normalized to lowercase. Non-images are skipped.                   |
| `includeFolders`    | `[]`                             | Folder selection objects; empty selects all. Use `includeRoot` for root.                                |
| `excludeFolders`    | `[]`                             | Folder selection objects; exclusion wins. Root inclusion is controlled by `includeRoot`.                |
| `includeRoot`       | `false`                          | Include root files alongside selected folders; unchecked excludes root.                                 |
| `generateAltText`   | `true`                           | Generate alt text in description; disabling prevents description writes.                                |
| `generateTags`      | `false`                          | Write generated tags to directus_files.tags.                                                            |
| `generateFilename`  | `false`                          | Write a safe download filename, preserving its extension.                                               |
| `overwriteAltText`  | `false`                          | Replace populated description when generateAltText is enabled; otherwise fill only missing alt text.    |
| `overwriteTags`     | `false`                          | Replace populated tags when generateTags is enabled; otherwise fill only missing tags.                  |
| `overwriteFilename` | `false`                          | Replace the download filename when generateFilename is enabled; otherwise fill only a missing filename. |

Default image MIME selection: `image/jpeg`, `image/png`, `image/gif`, and `image/webp`. These are
common vision-model input formats. Check the configured provider/model's restrictions; for example,
OpenAI supports only non-animated GIF inputs. Other formats such as SVG, AVIF, TIFF, and HEIC are
excluded by default. Change `mimeTypes` only to formats your model supports. Original image bytes
are sent without conversion or rasterization; unsupported inputs produce classified failures
(single-file runs reject).

The Studio shows **Overwrite Alt Text** only when **Generate Alt Text** is enabled, **Overwrite
Tags** only when **Generate Tags** is enabled, and **Overwrite Filename** only when **Generate
Download Filename** is enabled. Disabling generation hides its overwrite control and prevents writes
for that field, even if a previously saved overwrite value is true.

Alt text is written to `directus_files.description`. Consumers must map that value to rendered image
alt attributes; the extension does not modify frontend rendering. Whitespace-only descriptions and
filenames, null tags, empty tag strings, and arrays without nonblank tags count as missing.
Serialized tag arrays are interpreted the same way as real arrays, including all-blank arrays.
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
Omitted, null, empty, or whitespace-only operation values use the global default. Unsupported
languages are rejected by environment or operation validation. The effective language is appended to
every system prompt, including custom prompts; it takes precedence over conflicting language
instructions in that prompt. Alt text, tags, and descriptive filename words use that language.
Filenames remain lowercase ASCII slugs, with transliteration where necessary. Existing populated
fields still follow their independent overwrite controls; changing the language does not translate
preserved metadata.

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

| Option         | Default | Behavior                                                                                                        |
| -------------- | ------- | --------------------------------------------------------------------------------------------------------------- |
| `missingOnly`  | `true`  | Select files missing at least one enabled field; completed files do not consume `maxFiles`.                     |
| `maxFiles`     | `100`   | Select/attempt 1–1000 files per invocation. Higher limits require a separate resource-budget decision.          |
| `concurrency`  | `1`     | Integer from 1–100 active files end-to-end. Invalid values reject. 100 is allowed, not recommended.             |
| `afterId`      | `null`  | UUID keyset boundary. For regeneration, pass the preceding `nextCursor`. Empty Studio text means null.          |
| `excludeFiles` | `[]`    | Array of up to 1000 UUIDs to exclude, including persistent failures. Cleared Studio values mean an empty array. |

```json
{
  "generateTags": true,
  "missingOnly": true,
  "maxFiles": 100,
  "concurrency": 5,
  "includeRoot": false
}
```

Routine missing-only backfills self-advance: repeat the same options without an offset or cursor.
Only enabled fields determine eligibility. Overwrite controls apply independently to eligible files;
they do not make a complete file eligible in missing-only mode. To regenerate complete files, set
`missingOnly: false` and enable the appropriate generation and overwrite switches.

Reads use Flow accountability, exact folders, MIME filters, and enabled-field missing predicates. A
single ID-sorted query selects a superset of missing values, followed by exact refinement before
admission. Directus exposes tags as JSON and rejects `_empty`, `_eq`, and text operators for tags,
so both NULL and non-NULL tags must be inspected. Whitespace-prefixed descriptions and filenames
also require refinement. Complete values never consume `maxFiles`. Each run inspects at most 1000
rows using 50-row prefetches. If that budget is reached, continue with `afterId: nextCursor`.
Restart without `afterId` after finishing a traversal to include lower IDs or newly missing files.
This handles current stored representations; it is not a compatibility mode.

The processing queue refills whenever any slot settles, including across prefetch boundaries.
Concurrency bounds asset acquisition, byte reads, generation and writes together. It is not a
provider requests-per-second limiter. Start low and size concurrency against provider quotas,
available memory (up to the image-byte limit per active file, plus SDK overhead), and Flow
deadlines. The existing per-file timeout and two AI retries still apply; `maxFiles` bounds AI
attempts. Run backfill invocations serially; concurrency applies inside one invocation.

For `missingOnly: false`, pass `nextCursor` as `afterId` while `remaining` is true. ID keysets
tolerate deletions and metadata changes without shifting later pages. Directus rejects `_gt` on UUID
fields, so continuation reads a database index window of at most 1001 IDs and applies the bounded ID
filter through accountable FilesService. Sparse windows return continuation without unbounded scans;
metadata and assets still require Flow permissions. Returned boundaries are accountable selected
files. A bounded window containing no readable selected file rejects with an enumeration diagnostic
rather than exposing an inaccessible ID or claiming completion; narrow the selection or choose a
known readable afterId in that case. Keep selection options fixed. New or newly matching records
below the boundary require a new traversal. The queue excludes all prefetched, selected, active and
attempted IDs within a run, including failed IDs.

Failures remain eligible on later missing-only runs. To prevent permanent failures from starving
later files, add their IDs to `excludeFiles`, or use `afterId` as an explicit escape hatch. Retry
failed/excluded IDs with `ai-image-metadata` after resolving their cause. Exclusions and cursors
scope the traversal; completion does not claim that excluded or earlier files were repaired.

Continuation uses `nextCursor`/`afterId`; numeric `offset` options are rejected. A nonempty page is
sorted by ID and omits no matching record before its final ID. The cursor records the last inspected
file, never the last prefetched file. A separate boundary is allowed only for an empty, verified
index window, so stopping at `maxFiles` does not skip unconsumed queued files.

An empty exhausted run returns `results: []`, `scanned: 0`, `nextCursor: null`, `remaining: false`,
and `complete: true`. `scanned` counts admitted candidates; `inspected` additionally counts refined
coarse matches. `remaining` reports unconsumed enumeration or known unresolved files, conservatively
including coarse matches. `remainingIds` lists failed files and files still missing enabled metadata
after settled writes, including valid empty generated tag lists. `complete` requires exhaustion and
no unresolved file or fatal error. A null cursor with remaining IDs means retry those files; it does
not mean they were repaired.

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

Alt text, tags, and filename are requested and validated only when their respective
`generateAltText`, `generateTags`, and `generateFilename` controls are enabled. Alt text defaults to
enabled; tags and filename default to disabled. When all three are disabled, files are skipped
without provider calls. Disabled fields are omitted from the output schema and discarded if the
model returns them, so malformed unused tags or filenames cannot fail alt-text-only generation.

An empty or whitespace-only `DIRECTUS_EXTENSIONS_AI_API_KEY` environment value is treated as unset,
allowing startup without an AI key and provider-matched credential fallback. Generation still
requires a complete resolved configuration.

## Regeneration diagnostics

Regeneration returns
`{summary, results, scanned, inspected, nextCursor, remaining, remainingIds, complete}`. Every
result has `id`, `status`, `durationMs`, and `fields`; failed results additionally have
`error: {stage, code, retryable, httpStatus?, message}`. Messages and codes are allowlisted. Stages
cover `read_file`, `resolve_provider`, `read_asset`, `read_bytes`, `convert_image`, `generate`, and
`write_metadata`; conversion is reserved for future format support. Fatal summaries may identify
`validate_options`, `enumerate`, or `shutdown`.

`filesFound` and `filesAttempted` count distinct admitted candidates, including files skipped after
concurrent edits. Updated/skipped/failed counts describe settled outcomes. A fatal attempted file
can have no settled result. Provider/model are null when no eligible file resolved configuration.
Summary options are null if validation failed. `durationMs` uses a monotonic clock. Results retain
selection order, regardless of settlement order; `summary.options.concurrency` reports configured
concurrency.

`complete` means the scoped enumeration exhausted without file failures or a fatal error.
Outstanding prefetched rows, a candidate/inspection cap with remaining matches, and failures keep it
false. Shared provider configuration, enumeration and abort failures stop admission, settle active
jobs, log the partial summary, and reject the Flow. Independent accountable writes already completed
persist.

Connect the operation's resolve branch to a Condition inspecting
`<operation-key>.summary.hasFailures`: true handles partial failures; false handles successful runs.
Inspect `summary.complete` separately to determine whether further pages remain. The reject branch
handles fatal errors; a final partial summary is logged before rejection.

Ordinary per-file failures return a failed `FileResult` and allow the queue to continue. Throws
indicate fatal run failures: admissions stop and active jobs settle before rejection. After option
validation, `AI_METADATA_WRITER_REGENERATION_FAILED` carries `summary`, ordered settled `results`,
and `restartAfterId` in its error extensions. Restart from that original boundary after resolving
the cause; an advanced checkpoint could skip the failed file. Side effects are not rolled back.
Missing-only retries reselect incomplete files and preserve populated fields unless overwrite is
enabled. Overwrite regeneration is not idempotent: AI output may change on replay. To preserve
successful writes, add their IDs from the partial results to `excludeFiles` or retry explicit IDs.

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
      "excludeFolders": [null],
      "generateAltText": true,
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
  "inspected": 1,
  "nextCursor": null,
  "remaining": false,
  "remainingIds": [],
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
      "excludeFolders": [null],
      "generateAltText": true,
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
  "inspected": 2,
  "nextCursor": null,
  "remaining": true,
  "remainingIds": ["4c4e18d9-41ec-4cd5-a8cb-2d4e67520451"],
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
saves null or an empty array, meaning no folder selections. **Include Root Folder** (`includeRoot`)
is a boolean defaulting to false. When unchecked, root files are excluded. When checked, root files
are included alongside selected folders. An empty include list selects all non-root folders; with
Include Root Folder checked, it selects all folders including root. Keys must be UUIDs and the
collection must be `directus_folders`; malformed selections reject execution before side effects.

This replaces the previous UUID/string-array and null/root options. Existing Flows must replace UUID
strings with selection objects and use Include Root Folder instead of null entries. No automatic
migration or legacy editor is provided. Reopen and save the operation with the new controls before
running it. A singular null now means an empty picker, not root.
