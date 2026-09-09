TODO's for later:

- Im seeing some laziness around jsdocs...
  `     /**     * Editor callback.     * @param editor Parameter value.     * @param component Parameter value.     * @param props Parameter value.     * @returns Callback result.     */     `
  We should do a js docs pass to properly add well documented js docs

- Our guard utils (and probably also object utils and attempt methods) are not utilized. We shoudl
  do a full sweep of the extension and implement the appropriate utils

- We need to add a user / editor facing doc through `startup.documentation()`

- it is still possible to unintentionally add content "in between" component slots. This previously
  was a bug, where an enter or tab made it possible to focus between slots. That bug is fixed, but
  we can still do exactly that by using arrow keys (left/up or right/down). See attached screenshot
  of the callout component.

- Inside components i want to use a different blank line placeholder. Normally that is "Start
  writing or type '/' for commands". Inside components (such as table cell, component slots,
  blockquote etc), i want a minimal version "Start writing..."

- If you move a line via drag handle meenu "move up" or "move down" the handle is not always
  focusable anymore...

- if you hit enter twice inside a component slot after inserting content, a new blank line is
  created below the component. However, the blank line that was created INSIDE the component slot
  from the first enter keystroke is not removed...

- If a component is insert with multiple slots, autofocus shoudl always be on the first slot

- the block components, slots are rendered with two #'s. Eg for example `# #title`. I think we dont
  need any #..
