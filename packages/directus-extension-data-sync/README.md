# Data sync extension
Create an automated data sync between multiple Directus instances, for one or more collections. These collections need to share (part of) their field schema for this extension to work.

## Features
🔄 Keep data in sync between an unlimited number of Directus instances
✍️ Works with create, update, and delete events
🛠 Define shared collection and field schemas for each remote instance
🚨 Notify users when syncing errors occur

## Installation
Refer to the [Official Guide](https://docs.directus.io/extensions/installing-extensions.html) for details on installing the extension from the Marketplace or manually.

## Configuration
1. Update collection and field config
2. Update access policy to have create, update and delete permission for the collections (optionally select the fields as well)
3. Generate a token for the new "Data Sync Directus" user
4. Add this token to the remote instance(s) config options
5. Add tokens from remote users

## Gotchas
- Syncing of relationships is not supported
- This extension has only been tested with a Postgress database and `pg` databse client.

## Todo
- [ ] Setup config fields instead of hardcoded config