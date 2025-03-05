import { ApiExtensionContext } from '@directus/extensions';

export const SYNC_CONFIG = (env: ApiExtensionContext["env"]) => ({
    // Add your local instance settings
    localUrl: env.PUBLIC_URL,  // Local Directus URL
    localApiKey: "local-instance-api-key",  // Local API key for interacting with your own instance
  
    // List of remote Directus instances
    remotes: [
      {
        apiKey: "remote-instance-1-api-key",
        userId: "remote-instance-1-user-id",
        url: "http://localhost:" + env.PUBLIC_URL.endsWith('8055') ? '8056' : env.PUBLIC_URL.endsWith('8056') ? '8057' : '8055',
      },
      {
        apiKey: "remote-instance-2-api-key",
        userId: "remote-instance-2-user-id",
        url: "http://localhost:"  + env.PUBLIC_URL.endsWith('8055') ? '8057' : env.PUBLIC_URL.endsWith('8056') ? '8055' : '8056',
      },
    ],
  
    // Sync settings for specific collections and fields
    collections: [
        {
            name: "collection_name",
            fields: [
                {
                    key: "field_key",
                    type: "field_type",
                }
            ]
        }
    ]
  })