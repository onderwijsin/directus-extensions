---
'@onderwijsin/directus-markdown-editor-bundle': patch
---

Fix crashes when undo or clearing empties a text field in an editor drawer, tag input, or component
search. Preserve empty strings so validation stays usable without closing the editor.
