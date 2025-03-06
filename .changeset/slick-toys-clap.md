---
"@onderwijsin/directus-extension-data-sync": major
"utils": patch
---

Add data-sync extension

- add directus network docker compose to project root. This creates three directus instances, three postgress DBs and a network for them to communicate
- add new project utility: checkIfItemExists()
- add data schemas for policy, user and access (juction between user and policy)
- add data sync function for each event
- add notitication function for failed syncs
- add util functions
- add types
- add readme
- update project readme
- update lockfile
