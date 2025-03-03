# MS Exchange email
Fetch all emails sent and received by your organization (or a subset of your organization's users) for a given email address, and list the metadata for these email in a searchable interface. Very usefull for an internal CRM application, where you want to see teamwide email correspondence for any of the stored contacts.

## Installation
Refer to the [Official Guide](https://docs.directus.io/extensions/installing-extensions.html) for details on installing the extension from the Marketplace or manually.

## Configuration
To use this extension in your Directus app, you'll need to follow the steps below.

1. Choose your organizations email provider (you can find a list of supported providers below)
2. Add the necessary env variables. These mainly consist of authentication tokens for connecting with the provider

You can find specific docs on how to get the proper token within the provider's directory.


## Supported providers
This extension currenlt supports the following email providers. Want to add a new provider to the list? Submit a PR!

- Microsoft Azure (via MS Graph)