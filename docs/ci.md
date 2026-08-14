# Continuous integration

## Version one

The first CI contract is intentionally simple and runs:

1. formatting;
2. linting;
3. TypeScript checks; and
4. unit tests with V8 coverage collection.

Both `ci.yml` and `ci-yolo.yml` should use this understandable path. There is no package validation,
packed-package validation, external consumer, focused/full classifier, or complex YOLO exception in
version one.

## Later versions

After the first working slice, CI can add builds, package metadata validation, packed artefacts,
clean Directus consumers, change-aware scopes, and release gating. These should be introduced as
separate explicit contracts rather than copied wholesale from `nuxt-modules`.
