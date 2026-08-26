---
'@onderwijsin/directus-extension-utils': patch
'@onderwijsin/directus-magic-links-bundle': patch
---

Loosen SMTP email configuration validation to require only `EMAIL_SMTP_HOST`; SMTP port and credentials are now left to Directus and the consumer.
