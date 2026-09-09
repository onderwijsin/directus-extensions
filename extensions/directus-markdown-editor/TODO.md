- [ ] In the reference drawer, the refresh button shoudl be place to the right of 'change source',
      in a flex row with a tiny gap. The refresh button should only be visible if the source is
      outdated. And use a warning color (soft)

- [ ] In the reference drawer, when a refresh occurs of an outdated item, the stale reference notice
      doesnt diseapper. Not sure where this state is managed, but its not being updated, or the new
      state is not propagated to the component

- [ ] The "Some item references need attention." needs to be in a warning color, not neutral. That
      is also true for the "show report" action (use soft button variant)

- [ ] The table in reference report has equal widfth columns. Can we make the collection and status
      columns smaller? And the item display field column larger?

- [ ] In the reference report modal, the whole modal content is overflowable. That means, when there
      is a long list of references, the footer buttons are not immediately visible. Lets change our
      modal concept to: header (title + desc), body (table), and footer (refresh and close buttons).
      Then we only make the body overflow: scroll.
