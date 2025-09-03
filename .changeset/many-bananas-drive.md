---
"@onderwijsin/directus-bundle-email-viewer": minor
"@onderwijsin/directus-bundle-sluggernaut": minor
"@onderwijsin/directus-extension-cache-flush": minor
"@onderwijsin/directus-extension-data-sync": minor
"@onderwijsin/directus-extension-slugify-operation": minor
"utils": minor
---

# Update dependencies and fix async hook registration
* All workspace dependencies have been updated to the latest versions. Any issues resulting from this update (mainly zod, and Directus typings) have been fixed.
* All tsconfig files in the workspace have been updated. Deprecated moduleResolution `node` has been dropped in favor of `bundler`. The `target`, `lib` and `module` props have been updated accordingly.
* Lastly, all hooks that had async registration handlers have been refactored. Any asynchronous code that was part of the registration, has been moved to a `cli.after` hook. Async hook registration is not supported, and leads to hooks not being available when you except them to be (because they are still being loaded in the background). Effectively, this should not impact users of the extensions, unless you want to use these extensions in `cli.before` (which you shouldn't want). The asynchronous code is mostly related to schema changes
