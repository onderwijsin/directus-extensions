![github_banner](https://github.com/user-attachments/assets/641fecad-0b75-4fbb-9d53-22ffb0d819a8)

## 👋 Introduction
This repository contains extensions for [Directus](https://directus.io) that we’ve developed for our projects. Some of these extensions are actively maintained, while others may not be.  

Certain extensions serve a very specific purpose and have only been tested in our environment. As a result, they may not work in other Directus instances. That being said, you are more than welcome to try them out!

## 📦 Packages
Some extensions in this repository are (or will be) published to the Directus Marketplace. Please note that none of these extensions are [sandboxed](https://docs.directus.io/extensions/sandbox/introduction.html), so they will only be discoverable if you set [`MARKETPLACE_TRUST=all`](https://directus.io/docs/configuration/extensions#marketplace).

- [`directus-extension-slugify-operation`](https://github.com/onderwijsin/directus-extensions/blob/main/packages/directus-extension-slugify-operation)   
  Adds a flow operation to slugify inputs.
- [`directus-bundle-sluggernaut`](https://github.com/onderwijsin/directus-extensions/blob/main/packages/directus-bundle-sluggernaut)  
  A set of five extensions that handle and automate slugs, paths and redirects.
- [`directus-bundle-email-viewer`](https://github.com/onderwijsin/directus-extensions/tree/main/packages/directus-bundle-email-viewer)   
  Fetch and view your team's email to and from a given email address, without ever leaving Directus
- [`directus-extension-data-sync`](https://github.com/onderwijsin/directus-extensions/tree/main/packages/directus-extension-data-sync)   
  Sync data between different Directus instances that share (part of their) collection data schema

## ⚠️ Schema changes
Some of the extensions in this repo make modifications to your existing database schema. Some add fields to existing (system) collection, some add new collections to your data model. Neither of these should interfere with any of you existing data.

However, if you don't want an extension to modify your schema, or want more control over field configuration, you can disable it by setting this env var:

`DISABLE_EXTENSION_SCHEMA_CHANGE="true"`

This will apply to any of the extensions in this repo. You can also configure this options on a per extension basis (see extension docs for more details)

If you disable schema modifications, you're responsible for the availability of the necessary collections and fields! Please check the ./schema.ts file in the relevant extensions src folder for reference.

## 🤝 Contributing
Contributions are welcome! If you find a bug or want to improve an extension, feel free to open an issue or submit a pull request.  

### Guidelines:
1. Fork the repository and create a feature branch.
2. Follow the existing code style and structure.
3. Add clear commit messages and relevant documentation.
4. Test your changes before submitting a pull request.
5. Open a PR and provide a brief description of your changes.

## ⚖️ License
This repository is licensed under the [MIT License](LICENSE). You are free to use, modify, and distribute these extensions as long as you include the original license.

---

Let us know if you have any questions or feedback. Happy coding! 🚀
