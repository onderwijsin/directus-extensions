# Sluggernaut
Experimenting with an all in one bundle to handle slugs, redirects and route management. Bundle might be a good solution for seamless integration between slug creation/mutation, and automating redirects


## To do's
- [ ] Add support for parent <> child relations. Maybe add a path field?
- [ ] Support ordering input fields
- [ ] Handle archive with delete logic

## Gotcha's
- This extension will remove redirects to items that are deleted, archived, or have any other status than published. This extension assumes that the status field will have the key `status` and that only the values `published` or `active` are available in front end, and therefore are directable.