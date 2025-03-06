import { dataSyncUserSchema } from './schema';
import { PrimaryKey } from '@directus/types';

export const dataSyncUserId = dataSyncUserSchema.id as PrimaryKey

// Sync settings for specific collections and fields
const schema = [
    {
        name: "sample",
        fields: [
            {
                key: "test_field",
                type: "string",
            }
        ]
    }
]
export const SYNC_CONFIG = {  
    notifications: {
      users: ["b0acbc67-e017-4d4e-a4c1-d9285ad7a9d4"],
      slack: ""
    },

    // List of remote Directus instances
    remotes: [
      {
        apiKey: "atiOCP5h0lUkb6XHwOJoPKiCiBA6hTWH", // This value is only used for testing
        url: "http://directus2:8055",
        schema 
      },
      {
        // apiKey: "xwdqqCtNu0tnutvJ9Zzzyx416f9ZgHoT",
        apiKey: 'a',
        url: "http://directus3:8055",
        schema
      },
    ],   
}

export type SyncConfig = typeof SYNC_CONFIG