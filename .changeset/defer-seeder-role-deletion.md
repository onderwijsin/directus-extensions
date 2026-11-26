---
'@onderwijsin/directus-seeder-hook': patch
---

Delete managed system roles through Directus after selected user and access imports succeed.
Directus detaches child roles and suspends users assigned to the deleted roles, including records
outside Seeder management, while protecting the last active administrator.
