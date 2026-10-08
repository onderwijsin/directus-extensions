---
'@onderwijsin/directus-ai-image-metadata-bundle': minor
---

Select only JPEG, PNG, WebP, TIFF and AVIF files through fixed reader filters, ignoring retired saved
MIME options. Unsupported images and non-images are excluded before processing. Preserve folder,
overwrite, missing-only, accountability, cursor and maxFiles contracts.

Preserve original JPEG, PNG and WebP provider inputs. Normalize only AVIF and TIFF to PNG through
accountable Directus AssetsService transformations and Directus-managed derivative caching. Bound provider-input bytes and report safe per-file conversion
failures without changing stored source files or adding native dependencies.
