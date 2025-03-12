---
"@onderwijsin/directus-bundle-email-viewer": patch
---

Fix missing shared inboxes by not filtering users for active plans, since not every inbox has a plan. Irrelevant inboxes can still be filtered by global email exclusion
