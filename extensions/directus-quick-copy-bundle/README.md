# @onderwijsin/directus-quick-copy-bundle

Small Directus bundle for copying field values quickly from the Data Studio.

## Entries

| Entry                | Type      | Purpose                                                        |
| -------------------- | --------- | -------------------------------------------------------------- |
| `quick-copy-input`   | Interface | A regular Directus input rendered readonly with a copy button. |
| `quick-copy-display` | Display   | Renders a stored value with a copy button.                     |

The bundle is especially useful for IDs, UUIDs, tokens, and other values that users frequently need
to copy. It does not edit or generate values, provide an API, or change permissions.

## Requirements and installation

- Directus `>=12.2.0 <13`;
- Node.js `>=24.10.0` in the Directus runtime; and
- a trusted Directus installation capable of loading npm extensions.

Install the package in the Directus runtime and restart Directus:

```sh
pnpm add @onderwijsin/directus-quick-copy-bundle
```

This is a frontend-only bundle. It has no server-side hooks, endpoints, operations, environment
variables, or required permissions beyond the field access the user already has.

## Usage

For an editable field that should only be copied in the Studio, create a string, UUID, integer, or
big integer field and select `Quick Copy Input`. The field is always readonly; its value is not
changed by the extension. A copy button is shown when the field contains a value.

For list and detail views, select `Quick Copy` as the field display. The stored value is rendered as
text and the copy button copies the exact displayed value. Empty values render as `—` and copy an
empty string.

Copying depends on the browser Clipboard API or its legacy fallback. If the browser does not expose
a supported clipboard mechanism, the button is hidden.
