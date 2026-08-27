---
name: directus-quick-copy-bundle
description: Install and use the Quick Copy Directus interface and display.
---

# Quick Copy

Use this skill when installing or configuring `@onderwijsin/directus-quick-copy-bundle` in a
Directus project. The bundle adds a readonly input and a display that both offer a copy action.

## Contract

| Entry ID             | Type      | Supported field types             | Behavior                                                                              |
| -------------------- | --------- | --------------------------------- | ------------------------------------------------------------------------------------- |
| `quick-copy-input`   | Interface | string, uuid, integer, bigInteger | Renders a native Directus input disabled and adds a copy button for non-empty values. |
| `quick-copy-display` | Display   | string, uuid, integer, bigInteger | Renders the exact stored scalar value and adds a copy button.                         |

The input never emits edits and does not provide lock/unlock controls. The display does not open
links, format values, transform IDs, or write data. Empty display values render as `—` and copy as
an empty string.

## Prerequisites and installation

- Directus `>=12.2.0 <13`;
- Node.js `>=24.10.0` in the Directus runtime; and
- permission to install and restart the Directus runtime.

Install the published package in the runtime that loads Directus extensions:

```sh
pnpm add @onderwijsin/directus-quick-copy-bundle
```

Restart Directus, then select `Quick Copy Input` when configuring a field or `Quick Copy` when
configuring a display. The package is frontend-only and does not expose server routes or require
environment variables, collections, roles, policies, or additional permissions.

## Operational behavior

The copy action uses the browser clipboard support available to the Data Studio. Its accessible
label changes from `Copy value` to `Copied` after a successful copy. If no supported clipboard
mechanism is available, the button is hidden. The extension does not own clipboard permissions or
browser security policy, so consumers should test the behavior in their deployed browser context.

The bundle does not install Directus, change field values, generate IDs, validate values, expose an
API, or provide link-opening behavior. Users still need normal Directus read access to see the field
value.
