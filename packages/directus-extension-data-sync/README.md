# Data sync extension
Create an automated data sync between multiple Directus instances, for one or more collections. These collections need to share (part of) their field schema for this extension to work.

## Installation
Refer to the [Official Guide](https://docs.directus.io/extensions/installing-extensions.html) for details on installing the extension from the Marketplace or manually.

## Configuration


## Gotchas
- Syncing of relationships is not supported

## Todo
- [ ] research shared IDs between instances
- [ ] Setup config fields instead of hardcoded config
- [ ] Think of the cleanest way the check if the user is one that is reserved for API keys for remotes (to prevent infinite loop)
- [ ] Implement `syncData()` function