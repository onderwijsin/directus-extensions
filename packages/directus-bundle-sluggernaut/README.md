# Sluggernaut
The all in one bundle for your slugging needs! This bundle adds four extensions to Directus:
1. Slug interface
2. Slug display
3. Slug hooks
4. Redirect hooks

## Features
- Slugify one or multiple input values into a URL safe value, with optional configurations
- Adds a display and interface for your slug field, which work seamlessly with the hook extensions.
- Creates a redirect collection that can be utilized by front end applications
- Automagically creates redirects if slug values are changed

## Configuration: pre installation
1. (Optional) Delete any existing collection named `redirects` 

## Installation
Refer to the [Official Guide](https://docs.directus.io/extensions/installing-extensions.html) for details on installing the extension from the Marketplace or manually.

## Configuration: Post-installation
1. Navigate to the settings panel. There you'll find the following config options:
   - **Use Namespace**: Whether to use a collection's namespace when creating a redirect. If enabled, and if the corresponding collection has a namespace, the redirect will have a shape of: `/{namespace}/{old-slug}` > `/{namespace}/{new-slug}`.
   - **Use Trailing Slash**: Whether to use a trailing slash when creating a redirect. If enabled, the redirect will have a shape of: `/{old-slug}/` > `/{new-slug}/`.
2. (Optional) Configure namespaces for collections that (will) have a slug field. You can do this by navigating to the data model of the given collection and adding the namespace value.
3. Add slug fields to collections:
   - Create a new field within the data model of a collection.
   - Choose "Slug".
   - You can use any field key.
   - Choose one or more input fields. These need to be equal to the field key of string fields in your collection. For example: `title`, or a combination of `first_name` and `last_name`.
   - Choose optional configurations for `locale`, `on_create_only`, `make_unique`, and `lowercase`.
   - Choose "Continue in advanced mode", navigate to "Display" and choose "Slug".
   
   When adding the slug field, please ensure that:
   - You allow null values.
   - You do NOT require a value to be set on creation.
   - It's best to disable manual editing of the slug field.
4. (Optional) Configure access policies for the newly created redirect collection. By default, these are only accessable by admin users. We recommend using access filters in the public policy based on the `is_active`, `start_date` and `end_date` field. 


## Gotchas
- This extension will remove redirects where the destination is equal to the slug of items that are deleted, archived, or have any other status than published. This extension assumes that the status field will have the key `status` and that only the values `published` or `active` are available in the front end, and therefore are directable.
- If multiple input fields are selected, the output value will follow the order in which these fields are defined in the options list.
- If multiple input fields are selected, and you only modified one of these values, the operation will look up the existing value for the other input fields and use these. This means that support for multiple input fields (with lookup for existing values that are missing in the payload) will break if you modify multiple items simultaneously, since the operation can't return unique slug values for each item that was edited. In this case, an error is returned.
- If you remove a field from your data model that is used as an input field for a slug, this extension will break!
- It is possible to override a slug value by manually editing it. The value provided will be slugified, but any of the selected input fields will be ignored.

## To-dos
- [ ] Add support for parent-child relations. Maybe add a path field?
- [ ] Support ordering input fields.
- [ ] Implement redirect hooks.
- [ ] Ensure infinite redirect loops are prevented.