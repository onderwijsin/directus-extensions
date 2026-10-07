---
"@onderwijsin/directus-extension-utils": patch
"@onderwijsin/directus-markdown-editor-bundle": patch
"@onderwijsin/directus-ai-image-metadata-bundle": patch
---

Restrict AI model, credential, and base URL inheritance to matching provider layers. Provider overrides no longer send lower-layer credentials to a different provider, and Markdown Editor configuration follows the same provider-bound resolution.
