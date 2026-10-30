---
name: directus-ai-image-metadata-bundle
description: Configure Directus image metadata operations and backfills.
---

# Directus AI image metadata bundle

Generate accessible image alt text, optional tags, optional download filenames, and optional focal
points from Directus Flows using the Vercel AI SDK. Includes `ai-image-metadata` for explicit files
and `ai-image-metadata-regenerate` for manual, resumable batches. Private assets are read through
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
| `AI_METADATA_WRITER_MAX_IMAGE_BYTES` | positive integer, `10000000`                  | Hard provider-input collection limit; effective maximum 5 MB.                                  |
| `AI_METADATA_WRITER_TIMEOUT_MS`      | positive integer, `60000`                     | Deadline for acquisition, preparation, and generation.                                         |
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

| Option                 | Default                          | Behavior                                                                                                                                                                           |
| ---------------------- | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `maxImageSizeBytes`    | `500000`                         | Positive safe integer in bytes. Larger source files trigger WebP encoding; prepared output above this soft size threshold is warned about and still submitted.                     |
| `maxImageDimension`    | `1500`                           | Positive safe integer in pixels. Resize when the longest edge exceeds it, fitting inside `min(targetImageDimension, maxImageDimension)` without cropping or upscaling.             |
| `targetImageDimension` | `800`                            | Positive safe integer in pixels. Requested longest edge when dimension resizing is triggered; capped at `maxImageDimension`. Preserves aspect ratio without cropping or upscaling. |
| `language`             | environment language / `English` | Optional language override for this operation.                                                                                                                                     |
| `provider`             | `resolved environment`           | Provider override; credentials stay on the server.                                                                                                                                 |
| `model`                | `resolved environment`           | Image-capable model override.                                                                                                                                                      |
| `prompt`               | `environment/default`            | Replacement system instructions.                                                                                                                                                   |
| `includeFolders`       | `[]`                             | Folder selection objects; empty selects all. Use `includeRoot` for root.                                                                                                           |
| `excludeFolders`       | `[]`                             | Folder selection objects; exclusion wins. Root inclusion is controlled by `includeRoot`.                                                                                           |
| `includeRoot`          | `false`                          | Include root files alongside selected folders; unchecked excludes root.                                                                                                            |
| `generateAltText`      | `true`                           | Generate alt text in description; disabling prevents description writes.                                                                                                           |
| `generateTags`         | `false`                          | Write generated tags to directus_files.tags.                                                                                                                                       |
| `generateFilename`     | `false`                          | Write a safe download filename, preserving its extension.                                                                                                                          |
| `generateFocalPoint`   | `false`                          | Generate an approximate crop center in directus_files.focal_point_x and focal_point_y.                                                                                             |
| `overwriteFocalPoint`  | `false`                          | Replace complete focal-point pairs when generation is enabled; otherwise fill incomplete pairs together.                                                                           |
| `overwriteAltText`     | `false`                          | Replace populated description when generateAltText is enabled; otherwise fill only missing alt text.                                                                               |
| `overwriteTags`        | `false`                          | Replace populated tags when generateTags is enabled; otherwise fill only missing tags.                                                                                             |
| `overwriteFilename`    | `false`                          | Replace the download filename when generateFilename is enabled; otherwise fill only a missing filename.                                                                            |

Thresholds and the resize target belong to each operation, so a regeneration Flow can use different
values from an explicit-file Flow. Omitted, null, empty, or whitespace-only preparation option
values use their defaults; other values must be positive safe integers. Numeric strings, zero,
negatives, and fractions are rejected. Existing saved operations receive the defaults automatically.
All three controls are available in Studio; there are no environment overrides for these thresholds.

The former `targetImageSizeBytes` key remains accepted in saved Flows when `maxImageSizeBytes` is
unset or cleared. A supplied `maxImageSizeBytes` takes precedence. Resolved options and diagnostics
use only the current name; when editing an older Flow in Studio, copy any custom former value into
**Maximum Image Size (bytes)** before saving.

For example, configure one operation with:

```json
{
  "maxImageSizeBytes": 250000,
  "maxImageDimension": 1200,
  "targetImageDimension": 640
}
```

Effective settings are included in `summary.options.maxImageSizeBytes`,
`summary.options.maxImageDimension`, and `summary.options.targetImageDimension` for both operations.

Both operations select only Directus-transformable MIME types: `image/jpeg`, `image/png`,
`image/webp`, `image/tiff`, and `image/avif`. This fixed filter applies to paged queries and cursor
windows; explicit unsupported files are skipped before asset acquisition or provider resolution.
GIF, SVG, HEIC/HEIF, BMP, other image formats, PDFs, videos, audio, documents, and null MIME values
are excluded. The MIME selector is retired: saved `mimeTypes` values are accepted and ignored.
Existing Flows can therefore select a different set of candidates; folder, missing-only, overwrite,
accountability, cursor, and `maxFiles` bounds retain their meanings.

Images are prepared through accountable Directus AssetsService reads. The policy uses the configured
thresholds below (defaults shown):

| Input condition                                                                                    | Preparation                                                                                                       |
| -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| JPEG/PNG/WebP, longest edge at most 1500 px, filesize at most 500,000 bytes, focal points disabled | Original bytes and MIME pass through unchanged.                                                                   |
| Either dimension exceeds 1500 px                                                                   | Fit inside 800×800, preserving aspect ratio without cropping, padding, or enlargement; encode WebP at quality 80. |
| Dimensions acceptable but filesize exceeds 500,000 bytes, or filesize is unavailable               | Encode WebP at quality 80 without resizing.                                                                       |
| AVIF/TIFF, or focal-point generation enabled                                                       | Produce canonical, EXIF-oriented WebP at quality 80; resize only if oversized.                                    |
| Short edge below 250 px                                                                            | Record `smallImage: true` in preparation debug logs; never upscale automatically.                                 |

The Flow needs read access to `width`, `height`, and `filesize` for preparation. Positive integer
oriented dimensions are required; missing or invalid dimensions fail preparation. File sizes accept
nonnegative safe integers and decimal integer strings. Directus owns decoding, orientation,
first-frame/page handling, transparency, transformation limits, and cached derivatives. Preparation
leaves stored source bytes and file metadata unchanged. No additional image dependency is required.

**`maxImageSizeBytes` is a per-operation transformation threshold** (default 500,000 bytes),
measured before base64 encoding. There is at most one transformation attempt. An output above that
target is still sent to the provider, with a warning code `AI_METADATA_IMAGE_MAX_SIZE_EXCEEDED`. The
warning includes run/file IDs, original dimensions, MIME and byte size, output MIME and actual
bytes, transformation reasons, requested resize bounds, quality, duration, configured
`maxSizeBytes`, bytes over the maximum, and `submissionContinues: true`. Structured fields and
embedded JSON make it visible in both structured and text logs. `summary.assetsOverMaxSize` counts
these outputs, including subsequent provider/write failures; their results include
`imageMaxSizeExceeded: true`. Exceeding the soft size threshold alone does not mark the file or run
failed. The thresholds and resize target are configured separately on each operation. Resizing fits
inside `min(targetImageDimension, maxImageDimension)` pixels on each axis, preserving aspect ratio.
The target defaults to 800 px; WebP quality 80 stays fixed. Resizing uses this target only after
source dimensions exceed `maxImageDimension`; filetype and filesize-only transformations retain
permitted native dimensions. These operation settings leave the hard collection limit below
unchanged.

The separate hard collection limit remains the smaller of `AI_METADATA_WRITER_MAX_IMAGE_BYTES` and 5
MB. Outputs exceeding that limit fail before provider submission; provider/model limits may be
stricter. The environment default and override semantics are unchanged. No second compression pass
or transformation retry occurs. Existing AI SDK generation retries remain unchanged.

The per-file deadline covers acquisition, preparation, byte collection, and generation. Directus
native work follows its own `ASSETS_TRANSFORM_*` limits and may finish/cache a derivative after the
operation deadline; late streams are released.

Directus transformation failures report `stage: 'convert_image'` with `IMAGE_TRANSFORM_FAILED` or
`IMAGE_TRANSFORM_TIMEOUT`. Empty input, invalid dimensions, or an unexpected transformed WebP header
reports `IMAGE_TRANSFORM_INVALID_INPUT`; exceeding the hard byte limit reports
`IMAGE_TRANSFORM_LIMIT_EXCEEDED`. These failures do not reach the provider. Regeneration continues
with other files; explicit-file rejection semantics remain unchanged. Diagnostics exclude image
bytes and credentials. Captured upstream failure details are described below.

The Studio shows **Overwrite Alt Text** only when **Generate Alt Text** is enabled, **Overwrite
Tags** only when **Generate Tags** is enabled, and **Overwrite Filename** only when **Generate
Download Filename** is enabled, and **Overwrite Focal Point** only when **Generate Focal Point** is
enabled. Disabling generation hides its overwrite control and prevents writes for that field, even
if a previously saved overwrite value is true.

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

### Focal points and focal-only backfills

Both operations use one image input and one shared AI SDK generation call per eligible file,
including when focal points accompany textual outputs. The model returns
`focalPoint: {"x":250,"y":750}` in integer 0–1000 coordinates with a top-left origin. Coordinates
map to original stored, oriented image dimensions using
`min(dimension - 1, round(normalized * dimension / 1000))`. Both pixel coordinates are written
atomically through Directus services; `fields` reports `focal_point_x` and `focal_point_y`. There is
no radius field.

A complete manual pair, including zero coordinates, is preserved unless `overwriteFocalPoint` is
true. A partial pair counts as missing and is replaced together; old and generated coordinates are
never mixed. The row-lock recheck preserves complete focal points added during generation.
Nonpositive, fractional, missing, or unsupported dimensions prevent focal writes. The canonical WebP
must match the stored oriented dimensions after the requested proportional resize, and changed
dimensions or MIME during generation discard the focal output. Other enabled text fields keep their
independent policies. In a missing-only run, unresolved focal points remain in `remainingIds`;
repair the dimensions or exclude those files before retrying. This does not solve replacement of an
asset with another image of the same dimensions during generation.

Use `ai-image-metadata-regenerate` with these options to fill focal points while preserving all
text, even where a textual field is missing:

```json
{
  "generateAltText": false,
  "generateTags": false,
  "generateFilename": false,
  "generateFocalPoint": true,
  "overwriteFocalPoint": false,
  "missingOnly": true
}
```

Only `focalPoint` is requested and validated. Candidate selection checks either missing coordinate
independently of textual metadata. Complete pairs remain excluded in missing-only mode even with
overwrite enabled. Set both `missingOnly: false` and `overwriteFocalPoint: true` to replace complete
pairs without touching text. Add folder selection or `includeRoot: true` as needed.

The Flow also needs read access to `focal_point_x` and `focal_point_y`, and update access to both
coordinate fields. Focal generation requires Directus WebP transformations. Canonicalization remains
required for safe orientation; large images are proportionally resized before the shared model
request. Normalized focal points still map to original oriented dimensions. `transformed`,
preparation durations, and summary counters include these derivatives.

Focal guidance favors faces in portraits, the center of equally important groups, salient subjects,
or the image center when no clear subject exists. Image text is treated as data. These instructions
are added only when focal generation is enabled, including with custom prompts. General vision
models offer approximate localization; combined output failures can fail all requested outputs. A
single point cannot ensure good crops for every aspect ratio, groups, products, landscapes, or
text-heavy compositions. Deterministic orientation/persistence tests do not evaluate semantic crop
quality. Before bulk overwrite, review representative portraits, groups, products, landscapes, and
busy/text-heavy images at 16:9, 1:1, and 3:4 with your chosen provider/model. No measured
localization precision or production crop-quality guarantee is claimed.

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
`{ "results": [{ "id": "...", "status": "updated", "durationMs": 1200, "transformed": false, "originalMimeType": "image/png", "transformationDurationMs": 0, "fields": ["description", "tags"] }] }`.
Skipped files return `status: "skipped"` and `fields: []`. Successful results include no private
image, credential, or provider response. Failed results can include captured provider output and
validation details.

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
- Check Flow file permissions, image MIME declarations, exact folder selection, and populated
  metadata when files are skipped. Provider configuration is resolved lazily, so an entirely skipped
  run makes no provider calls.
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
6. Repeat missing-only backfills without an offset; for regeneration pass nextCursor as afterId
   while remaining is true. Enable overwrite controls only when replacement is intended. Branch on
   summary.hasFailures for regeneration; keep a rejection branch for fatal errors.

For an OpenAI-compatible deployment, set AI_METADATA_WRITER_PROVIDER=openai-compatible,
AI_METADATA_WRITER_MODEL to a vision model, and AI_METADATA_WRITER_BASE_URL to the provider's API
base URL. Supply AI_METADATA_WRITER_API_KEY or the compatible Directus settings credential. Verify
that its chat-completions API supports both image messages and structured responses before backfill.

### Directus transformation limits and metadata generation

Directus limits apply whenever preparation requests a derivative: oversized dimensions or bytes,
AVIF/TIFF conversion, unknown filesize, and canonical orientation for focal points. Acceptable
text-only JPEG/PNG/WebP files pass through without transformation.

| Directus setting                              | Default in Directus 12.2.0 | Effect                                                                          |
| --------------------------------------------- | -------------------------- | ------------------------------------------------------------------------------- |
| `ASSETS_TRANSFORM_IMAGE_MAX_DIMENSION`        | `6000` pixels              | Rejects uncached transformation when either source dimension exceeds the limit. |
| `ASSETS_TRANSFORM_IMAGE_MAX_OUTPUT_DIMENSION` | `3000` pixels              | Bounds every transformation step's output dimensions.                           |

These defaults come from
[Directus 12.2.0](https://github.com/directus/directus/blob/v12.2.0/packages/env/src/constants/defaults.ts).
Check your deployed version and overrides. Preparation resizes oversized dimensions before encoding,
so a 2048×3072 JPEG or 924×4453 PNG can produce an 800 px derivative under the default output cap.
Original source limits still apply; downscaling does not bypass them. Deployments with an output
limit below the requested dimensions may still reject preparation.

A Directus dimension rejection reports `IMAGE_TRANSFORM_FAILED` at `convert_image`, with upstream
`ILLEGAL_ASSET_TRANSFORMATION` in the captured diagnostic. No provider request or metadata write
occurs for that file. Regeneration isolates the failure; a single explicit-file operation rejects
the Flow. Compare stored dimensions and the preparation bounds with configured source/output limits.
Configure limits and concurrency for available memory; compressed byte size does not bound decoded
pixel memory. Failed transformations are not retried or replaced with original-image submission.

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

Alt text, tags, filename, and focal point are requested and validated only when their respective
`generateAltText`, `generateTags`, `generateFilename`, and `generateFocalPoint` controls are
enabled. Alt text defaults to enabled; all other outputs default to disabled. When all four are
disabled, files are skipped without provider calls. Disabled fields are omitted from the output
schema and discarded if the model returns them, so malformed unused tags or filenames cannot fail
alt-text-only generation.

An empty or whitespace-only `DIRECTUS_EXTENSIONS_AI_API_KEY` environment value is treated as unset,
allowing startup without an AI key and provider-matched credential fallback. Generation still
requires a complete resolved configuration.

## Regeneration diagnostics

Regeneration returns
`{summary, results, scanned, inspected, nextCursor, remaining, remainingIds, complete}`. Every
result has `id`, `status`, `durationMs`, and `fields`; failed results additionally have
`error: {stage, code, retryable, httpStatus?, message, raw?, validation?, issues?}`. Messages and
codes are allowlisted. Stages cover `read_file`, `resolve_provider`, `read_asset`, `read_bytes`,
`convert_image`, `generate`, and `write_metadata`; preparation failures retain
transformation-specific codes. Fatal summaries may identify `validate_options`, `enumerate`, or
`shutdown`.

`filesFound` and `filesAttempted` count distinct admitted candidates, including files skipped after
concurrent edits. Updated/skipped/failed counts describe settled outcomes. A fatal attempted file
can have no settled result. Provider/model are null when no eligible file resolved configuration.
Both operations return `summary.assetsTransformed` and `summary.transformsByMimeType` (counts keyed
by original MIME, for example `{ "image/avif": 2, "image/tiff": 1 }`). The explicit-file operation
returns `{ results, summary }`; its summary uses the same counters and correlation fields as
regeneration. Its `summary.options` contains normalized `files`, `language` (null when inherited),
folder selection, `includeRoot`, generation switches, and overwrite switches. Regeneration retains
its batch options and also reports `language`. Provider/model identify the resolved provider
separately; prompt text and credentials are omitted.

Every attempted preparation with a valid plan includes `results[].imagePreparation`:

- `reasons`: every applicable trigger, using `filetype` (AVIF/TIFF conversion), `dimensions` (source
  long edge exceeds `maxImageDimension`), `filesize` (source bytes exceed `maxImageSizeBytes`),
  `unknown_filesize` (source bytes unavailable), or `focal_point` (canonical orientation). Reasons
  are independent, so one file can have several.
- `source`: original `width`, `height`, `sizeBytes`, and `mimeType` from accountable metadata.
- `settings`: the effective `maxSizeBytes`, `maxDimension`, and requested `targetDimension` used for
  this file. Logs also show the effective capped resize bounds in `requestedWidth` and
  `requestedHeight`.
- `output`: prepared `width`, `height`, `sizeBytes`, and `mimeType`; null if acquisition or
  validation failed. Transformed dimensions come from the WebP header; unchanged originals retain
  their stored oriented dimensions. Output bytes are measured from the collected stream.

Successful transformations produce an **INFO** `Image metadata input prepared` log with this data,
run/file IDs, and safe JSON embedded in the message. Unchanged originals retain debug-level
preparation logs. The observations survive subsequent provider/write failures and also appear in
transformation failure logs when a plan was established. Skipped files need not have preparation
data.

The INFO completion summary includes `transformsByReason`, counting each reason for completed
transformations, including those followed by provider/write failures. For example, an image can
count once under both `dimensions` and `filesize`; reason counts therefore need not sum to
`assetsTransformed`. Failed preparation attempts do not count as completed transformations.
`transformsByMimeType` groups by the source MIME type; it does **not** explain why conversion ran.
`assetsOverMaxSize` counts prepared outputs still above the soft size threshold, rather than source
files that triggered compression. It can be zero even when `transformsByReason.filesize` is
positive.

For example, one JPEG exceeding both thresholds with focal generation enabled can produce:

```json
{
  "assetsTransformed": 1,
  "assetsOverMaxSize": 0,
  "transformsByMimeType": { "image/jpeg": 1 },
  "transformsByReason": { "dimensions": 1, "filesize": 1, "focal_point": 1 }
}
```

Every result also includes `transformed`, `originalMimeType`, and `transformationDurationMs`.
`transformed` becomes true only after a requested conversion yields valid WebP output; it remains
true if provider generation or metadata writing subsequently fails, and those conversions still
count in the summary. Failed conversion attempts are not counted. Original MIME is a sanitized
label, or null if metadata is inaccessible or its MIME declaration is missing/malformed. Unsupported
explicit files retain their known MIME even when skipped.

Acceptable pass-through JPEG/PNG/WebP files and skipped files have `transformed: false` and duration
`0`. For transformed inputs (dimension/byte preparation, AVIF/TIFF, or focal canonicalization),
duration measures the AssetsService conversion request, output streaming, and WebP canvas-header
check, ending before generation. Failed attempts retain elapsed time. Directus may serve an existing
cached derivative; these count as transformed provider inputs too. This measurement includes
storage/cache overhead and does not claim to isolate native CPU time or distinguish cache hits.
Counts cover settled results in the current run/page, including partial/fatal run summaries. Both
operations log the final returned summary without image bytes or generated content.

Folder arrays in `summary.options` show normalized selection: `null` represents files with no folder
(the root). When `includeRoot` is false, normalization appends `null` to `excludeFolders`; when it
is true and specific include folders are selected, it appends `null` to `includeFolders`. This
marker is generated by the operation, not copied from malformed picker input. The summary also
includes `includeRoot` so the root policy can be read directly.

Summary options are null until operation options have been validated. `durationMs` uses a monotonic
clock. Results retain selection order, regardless of settlement order; `summary.options.concurrency`
reports configured concurrency.

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
retains diagnostics, including captured failure details.

`error.raw` is a JSON-safe snapshot of available upstream `name`, `message`, `code`, HTTP status,
`cause`, retry `lastError`, provider `text`, parsed `value`, `responseBody`, `finishReason`, and
validation `issues`. SDK wrappers retain their causes; exhausted retries retain the last error. Zod
failures additionally expose `validation` from `z.prettifyError()` and machine-readable `issues`,
including field paths and violated rules. Single-file generation and write failures carry these
details in `AI_METADATA_WRITER_PROCESSING_FAILED` error extensions on the rejection branch.
Configuration and invalid-image rejection codes remain unchanged.

Captured data is bounded to eight nested levels, 100 entries per object/array, and 16,000 characters
per string. Circular references become `[circular]`; depth/string limits use `[truncated]`. Request
fields, headers, image fields, stacks, prompt fields, and credential-like keys are excluded.
Upstream messages and response text are retained verbatim within these limits and may contain
sensitive content: apply the same access controls and retention policy to Flow output and failure
logs as to provider responses. This is diagnostic data, not an executable instruction.

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
      "generateFocalPoint": false,
      "maxImageSizeBytes": 500000,
      "maxImageDimension": 1500,
      "targetImageDimension": 800,
      "overwriteFocalPoint": false,
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
    "complete": true,
    "assetsTransformed": 0,
    "assetsOverMaxSize": 0,
    "transformsByMimeType": {},
    "transformsByReason": {}
  },
  "results": [
    {
      "id": "ee913870-cedc-4112-9f2e-0baaa9253fb0",
      "status": "updated",
      "durationMs": 990,
      "fields": ["description"],
      "transformed": false,
      "originalMimeType": "image/png",
      "transformationDurationMs": 0
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
      "generateFocalPoint": false,
      "maxImageSizeBytes": 500000,
      "maxImageDimension": 1500,
      "targetImageDimension": 800,
      "overwriteFocalPoint": false,
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
    "complete": false,
    "assetsTransformed": 0,
    "assetsOverMaxSize": 0,
    "transformsByMimeType": {},
    "transformsByReason": {}
  },
  "results": [
    {
      "id": "ee913870-cedc-4112-9f2e-0baaa9253fb0",
      "status": "updated",
      "durationMs": 990,
      "fields": ["description"],
      "transformed": false,
      "originalMimeType": "image/png",
      "transformationDurationMs": 0
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
      },
      "transformed": false,
      "originalMimeType": "image/png",
      "transformationDurationMs": 0
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
names. The Studio user needs read permission on `directus_folders`, including `id`, `name`, and
`type` for the file-folder filter. Execution continues to use the Flow accountability for file
reads, assets, and writes. Matches are exact, without descendants; exclusions win and duplicate
selections are removed.

`includeFolders` and `excludeFolders` accept arrays of
`{"key":"11111111-1111-4111-8111-111111111111","collection":"directus_folders"}`. Clearing a drawer
saves null or an empty array, meaning no folder selections. **Include Root Folder** (`includeRoot`)
is a boolean defaulting to false. When unchecked, root files are excluded. When checked, root files
are included alongside selected folders. An empty include list selects all non-root folders; with
Include Root Folder checked, it selects all folders including root. Both Studio folder pickers
filter `directus_folders` to `type: "files"`, excluding Flow folders. Keys must be UUIDs and the
collection must be `directus_folders`; malformed selections reject execution before side effects.

This replaces the previous UUID/string-array and null/root options. Existing Flows must replace UUID
strings with selection objects and use Include Root Folder instead of null entries. No automatic
migration or legacy editor is provided. Reopen and save the operation with the new controls before
running it. A singular null now means an empty picker, not root.
