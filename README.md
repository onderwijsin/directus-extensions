![github_banner](https://github.com/user-attachments/assets/641fecad-0b75-4fbb-9d53-22ffb0d819a8)

<p style="text-align: left;">
  <a href="https://www.npmjs.com/package/@onderwijsin/directus-extension-slugify-operation"><img src="https://img.shields.io/npm/v/@onderwijsin/directus-extension-slugify-operation?label=slugify-operation&style=flat&colorA=2A2E35&colorB=FF9255" alt="directus-extension-slugify-operation" style="border-radius: 4px;"></a>
  <a href="https://www.npmjs.com/package/@onderwijsin/directus-bundle-sluggernaut"><img src="https://img.shields.io/npm/v/@onderwijsin/directus-bundle-sluggernaut?label=sluggernaut&style=flat&colorA=2A2E35&colorB=FF9255" alt="directus-bundle-sluggernaut" style="border-radius: 4px;"></a>
  <a href="https://www.npmjs.com/package/@onderwijsin/directus-bundle-email-viewer"><img src="https://img.shields.io/npm/v/@onderwijsin/directus-bundle-email-viewer?label=email-viewer&style=flat&colorA=2A2E35&colorB=FF9255" alt="directus-bundle-email-viewer" style="border-radius: 4px;"></a>
  <a href="https://www.npmjs.com/package/@onderwijsin/directus-extension-data-sync"><img src="https://img.shields.io/npm/v/@onderwijsin/directus-extension-data-sync?label=data-sync&style=flat&colorA=2A2E35&colorB=FF9255" alt="directus-extension-data-sync" style="border-radius: 4px;"></a>
  <a href="https://www.npmjs.com/package/@onderwijsin/directus-extension-cache-flush"><img src="https://img.shields.io/npm/v/@onderwijsin/directus-extension-cache-flush?label=cache-flush&style=flat&colorA=2A2E35&colorB=FF9255" alt="directus-extension-cache-flush" style="border-radius: 4px;"></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/onderwijsin/directus-extensions" alt="License"></a>
  <a href="https://github.com/onderwijsin/directus-extensions/actions"><img src="https://img.shields.io/github/actions/workflow/status/onderwijsin/directus-extensions/publish.yml" alt="GitHub Workflow Status"></a>
</p>


## 👋 Introduction
This repository contains extensions for [Directus](https://directus.io) developed for our projects. Some extensions are actively maintained, while others may not be. Certain extensions serve specific purposes and have only been tested in our environment. They may not work in other Directus instances, but you are welcome to try them out!

## 📖 Table of Contents
- [👋 Introduction](#-introduction)
- [📖 Table of Contents](#-table-of-contents)
- [🚀 Quick Start](#-quick-start)
  - [Prerequisites](#prerequisites)
  - [Installation](#installation)
- [⚠️ Schema Changes](#️-schema-changes)
- [📦 Packages](#-packages)
- [👨‍💻 Development](#-development)
  - [🔧 Setup](#-setup)
  - [🐰 Running Directus](#-running-directus)
  - [💽 Databases](#-databases)
  - [✅ Linting Your Code](#-linting-your-code)
- [🤝 Contributing](#-contributing)
  - [📝 Commit Guidelines](#-commit-guidelines)
- [⚖️ License](#️-license)

## 🚀 Quick Start

### Prerequisites
Before getting started, ensure you have:

- 🐳 Docker Desktop with compose (recommended v27.0.0+)
- 📦 pnpm installed on your system
- 🏗 Node.js (minimum v22.0.0, recommended v22.14.0)

### Installation
```bash
# Clone the repository
git clone https://github.com/onderwijsin/directus-extensions.git
cd directus-extensions

# Install dependencies
pnpm install

# Start development environment (watches for file changes)
pnpm dev

# In a second terminal, start Directus to test your extensions
pnpm start
```

## ⚠️ Schema Changes
Some extensions in this repo modify your existing database schema. Some add fields to existing (system) collections, while others add new collections to your data model. These changes should not interfere with any of your existing data.

If you don't want an extension to modify your schema or want more control over field configuration, you can disable it by setting this env var:

```env
DISABLE_EXTENSION_SCHEMA_CHANGE=true
```

This applies to any of the extensions in this repo. You can also configure this option on a per-extension basis (see each extension's docs for more details).

If you disable schema modifications, you're responsible for the availability of the necessary collections and fields! Please check the `./schema.ts` file in the relevant extension's src folder for reference.

## 📦 Packages
Some extensions in this repository are (or will be) published to the Directus Marketplace. Note that none of these extensions are [sandboxed](https://docs.directus.io/extensions/sandbox/introduction.html), so they will only be discoverable if you set [`MARKETPLACE_TRUST=all`](https://directus.io/docs/configuration/extensions#marketplace). We therefore strongly recommend to install the packages locally through the npm registry.

All extensions are compatible with Directus `^10.10.0 || ^11.0.0`.

- [`directus-extension-slugify-operation`](https://github.com/onderwijsin/directus-extensions/blob/main/packages/directus-extension-slugify-operation)  
  Adds a flow operation to slugify inputs.
- [`directus-bundle-sluggernaut`](https://github.com/onderwijsin/directus-extensions/blob/main/packages/directus-bundle-sluggernaut)  
  A set of five extensions that handle and automate slugs, paths, and redirects.
- [`directus-bundle-email-viewer`](https://github.com/onderwijsin/directus-extensions/tree/main/packages/directus-bundle-email-viewer)  
  Fetch and view your team's email to and from a given email address without leaving Directus.
- [`directus-extension-data-sync`](https://github.com/onderwijsin/directus-extensions/tree/main/packages/directus-extension-data-sync)  
  Sync data between different Directus instances that share (part of their) collection data schema.
- [`directus-extension-cache-flush`](https://github.com/onderwijsin/directus-extensions/tree/main/packages/directus-extension-cache-flush)  
  Send requests to (front end) applications if data changes in Directus. Fully configurable for specific collections and events.

For more detailed information on each extension, please check the README.md file in the respective package directory.

## 👨‍💻 Development   

### 🔧 Setup
This repo uses Docker and pnpm for development:
1. Clone the repository
```sh
git clone https://github.com/onderwijsin/directus-extensions.git
cd directus-extensions
```

2. Install dependencies
```sh
pnpm install
```

3. Start the development environment (auto-rebuilds on changes)
```sh
pnpm dev
```

### 🐰 Running Directus
With Docker compose, you can mount a Directus instance to test your extension code:

- **Single Instance**: Run `pnpm start` to use `docker-compose.yml` which mounts a single Directus instance with database and Redis cache.
- **Network Setup**: Run `pnpm network` to use `network.docker-compose.yml` which creates a network of three Directus instances with separate databases. This is useful for testing extensions that require inter-instance communication.

### 💽 Databases
The default database used in this project is a PostgreSQL database with PostGIS extension. For the default compose file, different profiles have been set up to test extensions for other database providers. Each database provider that Directus supports has its own profile (except for cloud databases, such as Redshift and Aurora). You can use these profiles by running `pnpm start:{profile}` (e.g., `pnpm start:sqlite`). Check this project's `package.json` for a full list of providers.

### ✅ Linting Your Code
We use [ESLint](https://eslint.org/) to maintain code quality and consistency. Before committing your changes, make sure to run ESLint and fix any issues:

   ```sh
   pnpm lint
   ```

To automatically fix linting errors, you can run:

   ```sh
   pnpm lint:fix
   ```

Ensure that your code passes all linting checks before submitting a pull request. To enforce this we added a pre-commit hook with `lint:fix`. You can disable this by setting `DISABLE_PRE_COMMIT_LINT=true` in the environmental variables in the project root.

## 🤝 Contributing
Contributions are welcome! If you find a bug or want to improve an extension, feel free to open an issue or submit a pull request. Please refer to the [CONTRIBUTING.md](CONTRIBUTING.md) file for guidelines.

### 📝 Commit Guidelines
This repository enforces consistent commit messages using commitlint, Husky, and Conventional Commits.

- **Commitlint**: Ensures commit messages follow the Conventional Commits format.
- **Husky**: Runs commitlint as a pre-commit hook to prevent invalid commit messages.
- **Conventional** Commits: A standardized format that makes commit history easier to read and automate.

**✅ How to Commit**    
For a guided commit flow, use ``pnpm commit``. This launches Commitizen, which helps you format your commit message correctly.

## ⚖️ License
This repository is licensed under the [MIT License](LICENSE). You are free to use, modify, and distribute these extensions as long as you include the original license.

---

Let us know if you have any questions or feedback. Happy coding! 🚀
