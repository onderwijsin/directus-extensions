![github_banner](https://github.com/user-attachments/assets/641fecad-0b75-4fbb-9d53-22ffb0d819a8)

## 👋 Introduction
This repository contains extensions for [Directus](https://directus.io) developed for our projects. Some extensions are actively maintained, while others may not be. Certain extensions serve specific purposes and have only been tested in our environment. They may not work in other Directus instances, but you are welcome to try them out!

## 📖 Table of Contents
- [👋 Introduction](#-introduction)
- [📖 Table of Contents](#-table-of-contents)
  - [Prerequisites](#prerequisites)
- [📦 Packages](#-packages)
- [👨‍💻 Development](#-development)
  - [💽 Databases](#-databases)
- [⚠️ Schema Changes](#️-schema-changes)
- [🤝 Contributing](#-contributing)
  - [📝 Commit Guidelines](#-commit-guidelines)
- [⚖️ License](#️-license)


### Prerequisites
Before getting started, ensure you have:

- 🐳 Docker Desktop with compose
- 📦 pnpm installed on your system
- 🏗 Node.js (version X.X.X or later)

## 📦 Packages
Some extensions in this repository are (or will be) published to the Directus Marketplace. Note that none of these extensions are [sandboxed](https://docs.directus.io/extensions/sandbox/introduction.html), so they will only be discoverable if you set [`MARKETPLACE_TRUST=all`](https://directus.io/docs/configuration/extensions#marketplace). We therefore strongly recommend to install the packages locally through the npm registry.

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

## 👨‍💻 Development
This repo uses Docker and pnpm. You'll need Docker Desktop with compose and pnpm installed on your system.

After cloning the repo, run ``pnpm install`` to add the necessary dependencies. When you're ready for development run ``pnpm dev`` in the root directory to automatically rebuild packages on file changes. This applies to any package in the `./packages` directory.

With Docker compose, you can mount a Directus instance to test your extension code. This repo contains two compose files:
- `docker-compose.yml` for mounting a single Directus instance with database and Redis cache. Run `pnpm start` to use.
- `network.docker-compose.yml` for mounting a network of three Directus instances with separate databases. Useful for scenarios where your Directus instance needs to interact with other instances. Run `pnpm network` to start.


### 💽 Databases
The default database used in this project is a PostgreSQL database with PostGIS extension. For the default compose file, different profiles have been set up to test extensions for other database providers. Each database provider that Directus supports has its own profile (except for cloud databases, such as Redshift and Aurora). You can use these profiles by running ``pnpm start:{profile}`` (e.g., ``pnpm start:sqlite``). Check this project's `package.json` for a full list of providers.

## ⚠️ Schema Changes
Some extensions in this repo modify your existing database schema. Some add fields to existing (system) collections, while others add new collections to your data model. These changes should not interfere with any of your existing data.

If you don't want an extension to modify your schema or want more control over field configuration, you can disable it by setting this env var:

`DISABLE_EXTENSION_SCHEMA_CHANGE="true"`

This applies to any of the extensions in this repo. You can also configure this option on a per-extension basis (see each extension's docs for more details).

If you disable schema modifications, you're responsible for the availability of the necessary collections and fields! Please check the `./schema.ts` file in the relevant extension's src folder for reference.

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