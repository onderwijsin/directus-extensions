Please continue wher eyou left of. Based on your stream, you stated

> The core change is in place: normalized metadata now requires and preserves nodeType, and both
> picker and slash-menu insertion converge on one resolver

However, I'm not seeing the expected behavior in the inline node view. Even though i have added
`nodeType = 'block'` to a component without slots, it is still rendered as an inline node.

Vice versa, if i add `nodeType = 'inline'` to a component meta that also has slots, it still behaves
like a block node.

However, the latter is actually good - because we wouldn't be able to provide good editing ui for
slots in an inline node anyway. However, the general bug needs to be fixed, where slotless
components don't behave as expected.

---

Secondly, there is another bug related to inline nodes, but this bug is not related to the nodeType
feature. I do want you to fix t though.

Consider this scenario:

1. User is on new blank line
2. User types `/ic` + enter. A new inline `Icon` component is inserted
3. User immediately types another character, for example `a`
4. User saves the item
5. Since the icon component does not have any prop data, the editor data is persisted as `:Icona`,
   hence the component is inferred as `Icona`.

There are multiple things going wrong here. The first is:

- After an inline component insert, we should always add a new space.

However, this does not fix the entire problem; a user can manually delete this space again, and the
issue would reoccur... Im not sure what the proper fix is here

The second thing that is going wrong; for which the fix does not solve the root cause of issue 1,
but merely hides it:

- The Icon component has a required `name` prop. If we insert a component via the insert menu (and
  not via typing the / command), the requirement is enforced. Eg, the component cannot be inserted
  until the prop is filled. However, `/Ic` + enter does not enforce this. It does not open the
  drawer, and just inserts the component without the required prop data. This results in different
  data shapes for both methods. A regular insert results in
  `:Icon{name="my-name" size="" mode="svg"}` whereas a slash menu insert results in `:Icon`

There are two things we need to fix here:

- if a component (inline or block doesnt matter) has a required prop, the component meta data drawer
  should open, and enforce this requirement before is can be inserted.
- if a component has default values (`mode` in the example Icon component), these should be
  automatically filled in upon insertion, regardless of method.

Again, this does not fix the `Icona` issue. Because inline components WITHOUT any props are also
valid components. So we still need to fix this issue seperately.

---

TODO's:

- Im seeing some laziness around jsdocs...
  `     /**     * Editor callback.     * @param editor Parameter value.     * @param component Parameter value.     * @param props Parameter value.     * @returns Callback result.     */     `
  We should do a js docs pass to properly add well documented js docs

- Our guard utils (and probably also object utils and attempt methods) are not utilized. We shoudl
  do a full sweep of the extension and implement the appropriate utils

- We need to add a user / editor facing doc through `startup.documentation()`
