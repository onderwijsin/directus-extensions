# @onderwijsin/directus-extension-data-sync

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
