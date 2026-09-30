---
"@onderwijsin/directus-markdown-editor-bundle": patch
---

- use min(0) for zod fields that shoudl accept blank or optional strings, instead of preprocessing empty strings to undefined.
- Remove old debug log that printed sensitive environment variables
  