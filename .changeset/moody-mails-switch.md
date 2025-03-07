---
"@onderwijsin/directus-extension-slugify-operation": patch
"@onderwijsin/directus-bundle-email-viewer": patch
"@onderwijsin/directus-extension-data-sync": patch
"@onderwijsin/directus-bundle-sluggernaut": patch
"utils": patch
---

Add eventContext to services
If you do not pass the existing db connection to the service it will use the default DB connection which deadlocks the db for sqlite

Further reference: https://github.com/directus/directus/issues/24798
