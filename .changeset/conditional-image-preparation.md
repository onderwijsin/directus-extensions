---
'@onderwijsin/directus-ai-image-metadata-bundle': minor
---

Prepare provider images conditionally: retain acceptable JPEG/PNG/WebP bytes, resize long edges
above the configured maximum (default 1500 px) toward the configured target (default 800 px), and use WebP quality 80 for byte-size preparation, AVIF/TIFF
conversion, and focal-point canonicalization. Small images remain at native resolution.

Configure each operation with `maxImageSizeBytes` (default 500,000 bytes), `maxImageDimension`
(default 1500 px), and `targetImageDimension` (default 800 px). All three appear in Studio and
run summaries. The resize bound is the smaller of the requested target and maximum dimension;
no resizing is requested for acceptable dimensions. The former `targetImageSizeBytes` remains
accepted in saved Flows as a fallback, with the current option taking precedence. Rename size
diagnostics to
`imageMaxSizeExceeded`, `summary.assetsOverMaxSize`, and
`AI_METADATA_IMAGE_MAX_SIZE_EXCEEDED` to distinguish byte size from dimensions.

Use the configured soft byte-size threshold (default 500,000 bytes): make at most one transformation
attempt, then submit larger outputs with an `AI_METADATA_IMAGE_MAX_SIZE_EXCEEDED` warning, per-file `imageMaxSizeExceeded` flag,
and `summary.assetsOverMaxSize` count. Existing hard byte limits and provider retries are unchanged.

Validate preparation dimensions and filesize metadata. Verify canonical WebP dimensions after
proportional resizing while mapping normalized focal points to the original oriented image.

Expose preparation reasons and source/output sizing in per-file `imagePreparation` diagnostics and
INFO preparation logs. Completion summaries include `transformsByReason`, with independent counts
for filetype, dimensions, filesize, unknown filesize, and focal-point orientation. Retain these
observations when transformation or subsequent provider processing fails.
