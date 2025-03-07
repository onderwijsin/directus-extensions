---
"@onderwijsin/directus-bundle-email-viewer": patch
"@onderwijsin/directus-extension-data-sync": patch
"@onderwijsin/directus-bundle-sluggernaut": patch
"utils": patch
---

✨ Disable automated schema changes
If you don't want an extension to modify your database schema, you can now disable it. This can either be done globally, or per extension. Beware that if you disbale schema changes, you are responsible for providing the changes yourself. The extensions still rely on certain collections and fields.

- add disableSchemaChange utility
- check environment vars for config settings, only trigger schema changes accordingly
- update readme
