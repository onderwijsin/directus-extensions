- [ ] for regular blank nodes there is no placeholder text (eg "Start writing or type '/' for
      commands")

- [ ] the drag handle node insert shoudl have reference (like it has components)

- [ ] If components are enabled, but no static data nor metadata URL is provided, the editor should
      handle it gracefully (eg hide component insert actions as if disabled).

- [ ] a active reference trigger (eg when typing '@' to mention a record) is not highlighted in
      primary color

- [ ] an active reference trigger shoudl not only be highlighted, but also show a muted placeholder
      hint "Hit enter to mention a record"

- [ ] flex boxes for reference search are off.. (see screenshot) The badge should be inline flex
      behind the display field, justified to the right.

- [ ] i dont like the reference drawer layout. Yes we shoudl show source data, we shoudl show a
      change source button. Refresh can probably be a header action for drawer (next to delete /
      apply). Presnetation heading can be dropped. In general this layout could do with some polish

- [ ] the is a bug in the search input. If i input a single character, and then backspace, it errors
      with `TypeError: Cannot read properties of null (reading 'trim')`. This does not seem to
      happen in component in sert modal search
