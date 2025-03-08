# Cache flush extension
Notify your front end application(s) when data changes in Directus, so they can flush their cache! fully configurable for multiple targets.

## Features
- ⚙️ Configuration for endpoints, collections and payloads to send to each target
- ✍️ Works with create, update, and delete events
- 🚨 Notifications when errors occur

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
   - For each of the applications you want cache to be flushed, create a target
   - Fill out all fields:
      - `status`: Only published targets receive calls
      - `url`: The full URL for the endpoint where a request should be sent to (for example: _https://directus.io/api/__hooks__/flush-cache_)
      - `auth_header`: the header property to authenticate calls
      - `api_key`: The api key to authenticate calls
      - `users_notification`: Select which users should receive a notification if a flush error occurs
      - `schema`: The data schema you want to flush. This should be an array of objects, where each object represents a collection, with a list of events for which flush calls need to happen. You also need to provide the payload prop, which is an array of field keys whose values should be included in the call's payload. Each of these props is required!
          
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
This extension sends `POST` requests to the provided endpoints, of type `application/json`. The request body is of type 👇

```ts
type RequestBody = Array<Payload>
interface Payload {
    collection: string
    event: 'create' | 'update' | 'delete'
    fields: Record<string, any> & {
        // Populated with the fields provided in the schema
        id: string | number // ID is always present in the payload, regardless of the provided schema
    }
    timestamp: number
}
```

Example 👇
```json
[
  {
    "collection": "test",
    "event": "delete",
    "fields": {
      "title": "a",
      "title_2": "b",
      "id": 1
    },
    "timestamp": 1741475430315
  },
  {
    "collection": "test",
    "event": "delete",
    "fields": {
      "title": "c",
      "title_2": "d",
      "id": 2
    },
    "timestamp": 1741475430315
  }
]
```

Happy flushing! 🚽