---
'@onderwijsin/directus-ai-image-metadata-bundle': minor
---

Expose transformation status, original MIME type and elapsed conversion duration on each file result.
Add transformed-asset counts and counts by original MIME to run summaries, including a summary for
explicit-file operations. Retain completed conversion diagnostics when later provider or write work
fails, and document cached derivatives and failed-attempt timing semantics.
