![](https://raw.githubusercontent.com/onderwijsin/directus-extensions/main/packages/directus-bundle-email-viewer/docs/Email_Viewer_Interface.gif)

# Directus Email Viewer
Fetch all emails sent and received by your organization (or a subset of your organization's users) for a given email address, and list the metadata in a searchable interface. Very usefull for an internal CRM application, where you want to see teamwide email correspondence for any of the stored contacts.

## Installation
Refer to the [Official Guide](https://docs.directus.io/extensions/installing-extensions.html) for details on installing the extension from the Marketplace or manually.

## Configuration
To use this extension in your Directus app, you'll need to follow the steps below.

1. Choose your organizations email provider (you can find a list of supported providers below)
2. Add the necessary env variables. These mainly consist of authentication tokens for connecting with the provider, and:
    - `EMAIL_VIEWER_PROVIDER="<provider>"`
    - `CLIENT_CACHE_TTL` (how long should email data be cached, in seconds)
3. Configure access policies. By default, none of the existing policies, including admin policies, have access to emails. When you navigate to Settings > Access policies, you'll notice that there is a new field in each policy: `Email Viewer Permission`. This field can have one of five values: 
   - `none`: user has access to none of the email
   - `self`: user has access to email sent or received by themselves
   - `domain`: user has access to email sent or received by addresses that share their domain name
   - `all`: user has access to all of the organization's email
   - `specific`: provide a set of specific email addresses the user has access to


You can find specific docs on how to get the proper token within the provider's directory.

![](https://raw.githubusercontent.com/onderwijsin/directus-extensions/main/packages/directus-bundle-email-viewer/docs/Email_Viewer_Settings.gif)

## Supported providers
This extension currenlt supports the following email providers. Want to add a new provider to the list? Submit a PR!

- [Microsoft Azure (via MS Graph)](https://github.com/onderwijsin/directus-extensions/blob/main/packages/directus-bundle-email-viewer/README.md)

## Gotchas
- You can manually set the cache for the added routes via env variables. But there's also cache applied to internal methods, to significantly increase performance:
  - Organization Domains are cached for 24 hours
  - Organization users are cached for 4 hours
  - User permissions are cached for 1 min