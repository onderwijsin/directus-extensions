---
name: sample-hook
description:
  Use the sample hook only to validate local Directus extension development in this repository.
---

# Sample hook

This is a development fixture, not a production extension. It logs after item create, update, and
delete events. It requires a local Directus instance started by the repository Compose stack.

Do not use it as a general-purpose audit log: messages are process logs, are not persisted, and do
not provide a complete history or security record.
