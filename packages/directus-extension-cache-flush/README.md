# Cache flush extension
Notify your front end application(s) upon data changes, so they can flush their cache!

## Features
- ⚙️ Configuration for endpoints, collections and payloads to sent
- ✍️ Works with create, update, and delete events
- 🚨 Notify users when errors occur

## ⚠️ Schema changes
This extension makes modifications to your existing database schema. It adds two collections: `cache_flush_targets` and `cache_flush_targets_directus_users`. Neither of these should interfere with any of you existing data.

However, if you don't want this extension to modify your schema, or want more control over field configuration, you can disable it by setting one of these env vars:
- `CACHE_FLUSH_DISABLE_SCHEMA_CHANGE="true"`
- `DISABLE_EXTENSION_SCHEMA_CHANGE="true"` (globally applied to all [@onderwijsin](https://github.com/onderwijsin/directus-extensions) extensions)
   
**If you disable schema modifications, you're responsible for the availability of the necessary collections and fields!** Please check the `./schema.ts` file for reference.


## Configuration pre installation
Make sure you don't have a collection named `cache_flush_targets` or `cache_flush_targets_directus_users`

## Installation
Refer to the [Official Guide](https://docs.directus.io/extensions/installing-extensions.html) for details on installing the extension from the Marketplace or manually.

## Configuration
1. Navigate to the newly created collection `Cache Flush Targets`
   - For each of the applications you want to flush cache for, create a target
   - Fill out all fields:
      - `status`: Only published sources receive calls
      - `url`: The full URL for the endpoint where a request should be sent to (for example: _https://directus.io/api/__hooks__/flush-cache_)
      - `auth_header`: the header property to authenticate calls
      - `api_key`: The api key to authenticate calls
      - `users_notification`: Select which users should receive a notification if a flush error occurs
      - `schema`: The data schema you want to flush. Add an array of objects, where each object is a collection, with a list of events for which flush calls need to happens. You can also need to provide the payload prop, which is an array of field keys whose values should be included in the call's payload.
          
        ```
        [
          {
              "collection": "collection",
              "events": [ "create", "update", "delete" ]
              "payload": [
                  "field_key"
              ]
          }
        ]
        ```

## Request Info
This extension sends `POST` requests to the provided endpoints, of type `application/json`. The request body is of type

```ts
interface RequestBody {
    collection: string
    event: 'create' | 'update' | 'delete'
    fields: Record<string, any> & {
        id: string | number
    }
    timestamp: number
}
```

Example 👇
```json
{
  "collection": "test",
  "event": "delete",
  "fields": {
    "id": 4,
    "title": "asdSAD",
    "field_2": null
  },
  "timestamp": 1741359811122
}
```
