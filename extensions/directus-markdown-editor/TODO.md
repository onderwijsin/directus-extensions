The code block:

- Im not seeing shiki styles / syntax highlighting? That was the whole point of using Shiki in the
  first place.
- There is a weird bug where the latest character of the language input gets cut off or not
  registered properly.
- The language input should be a select interface (with search, directus UI supports this i
  believe). Make sure all common languages and file types are represented, especially in web dev
  environments (so long as shiki supports them / Nuxt Ui can highlight them)
- The file name input placeholder should just be "Filename"
- The collapsable checkbox shoudl be rendered as an icon toggle button (not a checkbox). use the
  collapse_content and expand_content icons respectively. Also give the button a tooltip
- The code editor shoudl support tab indents... Currently a tab just focusses on the next tabbable
  element on page

Other To do's:

- disabling a configured tool should also disable its keyboard shortcut. Currently configuration
  removes its UI and slash-menu entry, but Tiptap’s native shortcut may remain active.
- hitting enter twice when inside a component slot does move the cursor to the next node after the
  component, but it does not reliably create a blank node. sometimes it does (if the next node is
  already a blank or pragraph node) but the cursor is focused below the new blank line. SOmetimes t
  doesnt (for example if the next node is a table or component, than it tries to insert a new blank
  node INSIDE that complex node)
- The drag handle and node insert buttons have a higher z index than the sticky toolbar.. They
  shoudlnt
- Its currently possible to remove component slots... If i backspace inside an empty slot, the slot
  gets removed.
- if i save a document with a component that has empty slots, those slots are populated with the
  slot label. See below

```
::Hero
#title
#title
#description
#description

::
```

- If the slash menu is active and another overlay element activates (eg component insert, or a
  drawer), the slash menu should be dismissed to avoid overlapping UI elements.
- the source code editor has a medium gray background shade in darkmode which looks weird. It shoudl
  probably have a transparant background. In light mode, the background color matches the drawer
  background (white)
- The drag handle position for tables and code blocks is vertically centered (and for images and
  video too probably). For these (larger) elements, we want the drag handle position similar to the
  way its positioned for MDC components - at the top of the block
- Lets add a "Full screen" mode button to the action toolbar. It can be the last button, after the
  source code edit. This new action shoudl also be configurable in the interface options. We can
  mimic the behavior from directus's rich html input interface, which also has a full screen mode.
  The only thing i would change is that when full screen is active, the button icon shoudl be
  inverted!
- Im not sure what makes the sample icon component render inline (as opposed to block). But its
  vertical align in slightly off. Also, the settings icon only renders on hover, which can be
  confusing. I think we shoudl drop the settings icon entirely, and just open the component drawer
  directly when the component is clicked.
- Check whether all UI controls on custom components are disabled when the interface is non editable
  (eg in published view)

- more editor actions is disabled?? (Since we worked on input disbaled states when the interface is
  non-editable)
