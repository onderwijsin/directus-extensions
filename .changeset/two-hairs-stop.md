---
"@onderwijsin/directus-extension-data-sync": minor
---

BREAKING!: update the collection name that is used for storing remote sources
Both the remote sources collection and it's junction to directus_users have a new name: data_sync_remote_sources. This is done so that the collection name directly refers to the extension.
If you already have the remote_data_sources and remote_data_source_directus_users collections in your system, you need to manually remove them after migrating you data to the new collection
