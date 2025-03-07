# @onderwijsin/directus-extension-data-sync

## 1.1.0

### Minor Changes

- 6c1b2be: BREAKING!: update the collection name that is used for storing remote sources
  Both the remote sources collection and it's junction to directus_users have a new name: data_sync_remote_sources. This is done so that the collection name directly refers to the extension.
  If you already have the remote_data_sources and remote_data_source_directus_users collections in your system, you need to manually remove them after migrating you data to the new collection

### Patch Changes

- 22299eb: ✨ Disable automated schema changes
  If you don't want an extension to modify your database schema, you can now disable it. This can either be done globally, or per extension. Beware that if you disbale schema changes, you are responsible for providing the changes yourself. The extensions still rely on certain collections and fields.

  - add disableSchemaChange utility
  - check environment vars for config settings, only trigger schema changes accordingly
  - update readme

- 504dcf9: Implement new createNotification utility
- 24e24d1: Add eventContext to services
  If you do not pass the existing db connection to the service it will use the default DB connection which deadlocks the db for sqlite

  Further reference: https://github.com/directus/directus/issues/24798

- 2b40e14: Update readme with config options
- b90facf: Cleanup schema to only use props supported by all db providers
- 563f26e: Fix items services in sqlite by proving existing DB connextion (attempt 2)
- Updated dependencies [22299eb]
- Updated dependencies [8413a05]
- Updated dependencies [24e24d1]
- Updated dependencies [563f26e]
  - utils@0.1.3

## 1.0.0

### Major Changes

- 2d29e2c: feat(data-sync): add config of remote sources to data studio - create remote_data_sources collection and fields - create junction to directus_users - auto configure relationships - implement fetchRemotes utlity function - add typing for remote sources - remove local config for remote sources - add schema for collections, fields and relations
- 6a21da5: Add data-sync extension

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

### Patch Changes

- Updated dependencies [143e474]
- Updated dependencies [2d29e2c]
- Updated dependencies [6a21da5]
  - utils@0.1.2
