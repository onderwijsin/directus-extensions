---
"@onderwijsin/directus-extension-slugify-operation": minor
"@onderwijsin/directus-extension-cache-flush": minor
"@onderwijsin/directus-bundle-email-viewer": minor
"@onderwijsin/directus-extension-data-sync": minor
"@onderwijsin/directus-bundle-sluggernaut": minor
"utils": minor
---


## Implementation of ESLint

### Overview
We have implemented ESLint in the project to ensure code quality and consistency. The implementation follows the standards set by `@directus/eslint-config` and was guided by the Directus Labs extensions monorepo.

### Configuration
The ESLint configuration is based on `@directus/eslint-config` with some custom overrides to better fit our project's needs. These overrides are specified in `eslint.config.mjs`.

### Steps Taken
1. **Installation**: Installed ESLint and the `@directus/eslint-config` package.
2. **Configuration**: Created and customized the `eslint.config.mjs` file to include necessary overrides.
3. **Integration**: Integrated ESLint into the project's build and CI processes to ensure continuous code quality checks.
4. **Linting**: Ran ESLint across the entire codebase and fixed all identified linting errors.
5. **Update docs**: added info on eslint to README.md and CONTRIBUTING.md

### Benefits
- **Consistency**: Ensures consistent coding styles across the project.
- **Quality**: Helps in identifying and fixing potential issues early in the development process.
- **Maintainability**: Makes the codebase easier to maintain and understand.