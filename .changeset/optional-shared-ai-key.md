---
"@onderwijsin/directus-extension-utils": patch
"@onderwijsin/directus-markdown-editor-bundle": patch
"@onderwijsin/directus-ai-image-metadata-bundle": patch
---

Treat blank optional shared AI environment keys as unset so local and E2E Compose can start without live credentials. Resolved provider configurations still require a nonblank key.
