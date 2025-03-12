---
"@onderwijsin/directus-bundle-email-viewer": minor
---

## ✨ Implement email threads
It is now possible to view entire emial threads, right in Directus. You need to configure this option globally through the Settings panel.

The email HTML string is sanitized using DOMPurify to prevent XSS attacks.

The email veiwer is rudimentary, and relies on the styles from the email itself. Further configuration is needed for a full blown (and styling) email renderer
