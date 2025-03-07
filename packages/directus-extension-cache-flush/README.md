# Cache flush extension
Notify your front end application(s) upon data changes, so they can flush their cache!

## Features
- 🔄 Configuration for endpoints, collections and payloads to sent
- ✍️ Works with create, update, and delete events
- 🚨 Notify users when errors occur

## ⚠️ Schema changes
This extension makes modifications to your existing database schema. It adds two collections: `cache_flush_targets` and `cache_flush_targets_directus_users`. Neither of these should interfere with any of you existing data.

However, if you don't want this extension to modify your schema, or want more control over field configuration, you can disable it by setting one of these env vars:
- `CACHE_FLUSH_DISABLE_SCHEMA_CHANGE="true"`
- `DISABLE_EXTENSION_SCHEMA_CHANGE="true"` (globally applied to all [@onderwijsin](https://github.com/onderwijsin/directus-extensions) extensions)
   
**If you disable schema modifications, you're responsible for the availability of the necessary collections and fields!** Please check the `./scherma.ts` file for reference.


## Configuration pre installation
Make sure you don't have a collection named `remote_data_sources` or `remote_data_sources_directus_users`

## Installation
Refer to the [Official Guide](https://docs.directus.io/extensions/installing-extensions.html) for details on installing the extension from the Marketplace or manually.

## Configuration
1. Navigate to _Settings > Access Policies_
   - For the policy "Data Sync", add `create`, `update` and `delete` permissions for each of the collection you want to sync.
   - Optional: configure the permitted fields for each collection, though strictly speaking this is not necessary, due to the config you'll provide in the next step
2. Navigate to the newly created collection `Remote Data Sources`
   - For each of the remote instances you want to sync with, create a data source
   - Fill out all fields:
      - `status`: Only published sources are synced
      - `url`: The full URL for the remote instance (for example: _https://instance2.directus.io_)
      - `api_key`: The api key for the Data Sync user in the remote instance (see next steps)
      - `users_notification`: Select which users should receive a notification if a data sync error occurs
      - `schema`: The data schema you want to sync. Add an array of object, where each object is a collection to sync, with a list of field keys. Only listed field keys are synced to the remote source!
          
        ```
        [
          {
              "name": "collection",
              "fields": [
                  "field_key"
              ]
          }
        ]
        ```
3. Navigate to Users. Generate a token for the new "Data Sync Directus" user. Copy this token and stor eit for later
4. Repeat each of the steps above, for each of the remote sources. Afterwards, you'll need to add the tokens generated in the remote sources to the first instance.

## Gotchas
- Syncing of relationships is not supported
- This extension has only been tested with a Postgress database and `pg` databse client.
