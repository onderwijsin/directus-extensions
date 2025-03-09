# Data sync extension
Create an automated data sync between multiple Directus instances, for one or more collections. These collections need to share (part of) their field schema for this extension to work.

## Features
- 🔄 Keep data in sync between an unlimited number of Directus instances
- ✍️ Works with create, update, and delete events
- 🛠 Define shared collection and field schemas for each remote instance
- 🚨 Notify users when syncing errors occur

**You need to install this extension in each of the Directus instances you want synced. You need to repeat the configuration steps for each instance**

## ⚠️ Schema changes
This extension makes modifications to your existing database schema. It adds two collections: `data_sync_remote_sources` and `data_sync_remote_sources_directus_users`. It also adds a new user, a new access policy, and assigns this policy to the user (see configuration setp 1 and 3). Neither of these should interfere with any of you existing data.

However, if you don't want this extension to modify your schema, or want more control over field configuration, you can disable it by setting one of these env vars:

`DATA_SYNC_DISABLE_SCHEMA_CHANGE="true"`   
`DISABLE_EXTENSION_SCHEMA_CHANGE="true"` (globally applied to all [@onderwijsin](https://github.com/onderwijsin/directus-extensions/tree/feat/cache-flush) extensions)   
   
If you disable schema modifications, you're responsible for the availability of the necessary collections and fields! Please check the `./schema.ts` file for reference.

## Configuration pre installation
Make sure you don't have a collection named `data_sync_remote_sources` or `data_sync_remote_sources_directus_users`

## Installation
Refer to the [Official Guide](https://docs.directus.io/extensions/installing-extensions.html) for details on installing the extension from the Marketplace or manually.

## Configuration
1. Navigate to _Settings > Access Policies_
   - For the policy "Data Sync", add `create`, `update` and `delete` permissions for each of the collection you want to sync.
   - Optional: configure the permitted fields for each collection, though strictly speaking this is not necessary, due to the config you'll provide in the next step
2. Navigate to the newly created collection `Data Sync Remote Sources`. For each of the remote instances you want to sync with, create a data source, and provide info for each field:
      - `status`: Only published sources are synced
      - `url`: The full URL for the remote instance (for example: _https://instance2.directus.io_)
      - `api_key`: The api key for the Data Sync user in the remote instance (see next steps)
      - `users_notification`: Select which users should receive a notification if a data sync error occurs
      - `schema`: The data schema you want to sync. Add an array of objects, where each object is a collection to sync, with a list of field keys. Only listed field keys are synced to the remote source! Both props are required.
          
        ```
        [
          {
              "collection": "collection",
              "fields": [
                  "field_key"
              ]
          }
        ]
        ```
3. Navigate to Users. Generate a token for the new "Data Sync Directus" user. Copy this token and store it for later
4. Repeat each of the steps above, for each of the remote sources. Afterwards, you'll need to add the tokens generated in the remote sources to the first instance.

## Gotchas
- Syncing of relationships is not supported
- You should not use users other then the one created by this extensions to authenticate data sync requests. Doing so would result in an infinite update loop, since the user id is what prevents this.
