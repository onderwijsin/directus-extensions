# Redirect hooks
A fully automated redirect handler for your front end routes. Listens to changes in any slug field, and creates redirect records from the old to the new value! This extension is part of the Sluggernaut Bundle.

## Under the hood
- The extension creates a collection `redirects`, or modifies the existing collection under that namespace. (best not to have is present upon installing the extension)
- The extension add configuration options to the Settings Panel in the Data Studio
- The extension adds a `namespace` field to the collection data model
- the extention implements `items.update` and `items.delete` hooks for each collection where the `slug-interface` is implemented, and creates, modifies or deletes redirect records accordingly
- The extension prevents infinite redirect loops from being created


## Installation
Install `directus-bundle-sluggernaut`. Refer to the [Official Guide](https://docs.directus.io/extensions/installing-extensions.html) for details on installing the extension from the Marketplace or manually.

## Configuration
1. (Optional) Delete any existing collection named `redirects`
2. Navigate to the settings panel. There you'll find the following config options:
   <!-- 1. Field Key: the key where you store your slug values. *This key needs to be the same for every collection with a slug in the data model! The field type needs to be a string!* -->
   2. Use Namespace: whether to use a collections namespace when creating a redirect. If enabled, and if the corresponding collection has a namespace, the redirect will have a shape of: `/{namespace}/{old-slug}` > `/{namespace}/{new-slug}` 
   3. Use Trailing Slash: whether to use a trailing slash when creating a redirect. If enabled, the redirect will have a shape of: `/{old-slug}/` > `/{new-slug}/` 
   <!-- 4. Redirect Collections: which collections should be listened to for changes in the slug values. *Beware: only select collections that have the configured field key! Also note that you should update these settings when you add or remove collections in your data model* -->
3. (Optional) configure namespaces for your collections!


## Manual usage 
It's perfectly fine to manually add redirects to the collection. That's it! Happy redirecting 😁

## To do's
- [x] Setup extension with boilerplate
- [x] Implement redirect collection
- [x] Add README
- [ ] Find collections that use slug interface. Is needed for `items.delete` action
- [ ] Listen to `slug.update` event with emitter.onAction()
- [ ] implement hooks
- [ ] implement infinite redirect loops
- [x] implement config fields
- [x] Create junction table for config: `junction_directus_redirects_settings_directus_collections`
- [x] implement namespace field