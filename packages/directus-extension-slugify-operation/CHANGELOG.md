# @onderwijsin/directus-extension-slugify-operation

## 1.0.1

### Patch Changes

- 24e24d1: Add eventContext to services
  If you do not pass the existing db connection to the service it will use the default DB connection which deadlocks the db for sqlite

  Further reference: https://github.com/directus/directus/issues/24798

## 1.0.0

### Major Changes

- b7b8e36: Initial release of `@onderwijsin/directus-extension-slugify-operation` and `@onderwijsin/directus-bundle-sluggernaut`
