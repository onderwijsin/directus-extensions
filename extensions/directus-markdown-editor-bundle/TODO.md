- [ ] Request errors are now rendered below the toolbar. Can we use the directus snackbar for that
      instead?
- [ ] The diff view modal should use the same with style as the reference and component report
      modals
- [ ] If a document AI skill is selected, the "Edit with AI" tooltip remains visible, but it should
      be hidden on the selection.

- [ ] Im not super happy with the suggestion menu layout... not with the elements layout, as well as
      it always rendering at the top of the editor (and not at the selection it will be applied to).
      A better solution would be to render it inline - eg "soft replace" already. And then clearly
      indicate that this insertion is still pending. Then we can provide a floating action menu for
      further interactions: cancel, confirm, or retry. It would also allow us to alter modifications
      inline before confirming them. The question is "where this document state lives"... Does it
      live within the editor instance - thereby inside the current markdown string, or should it be
      managed externally (and if so, how do we make it feel like part of the editor UX wise)? The
      former is tricky, becasue if its affects the actual mardkown state, a user could persist that
      'pending' state to database

- [ ] We need a third skill scope: 'insert'. This is for skills that generate and insert content at
      a given position in the document, without replacing existing content. These skills shoudl ONLY
      be available via the / menu; because that content menu is only avaliable on blank line, so we
      have something to insert into! For now we dont need to seed any insert skills.

- [ ] That means the / menu needs a new "AI" section. It should be the first section, and list all
      available insert AI skills. We also offer a "Write with AI" option for generating new content.
      This shoudl be the first listed action of the AI section. Its basically the equivalent of an
      "ask AI" action in the other context menu's, but instead of rewriting, it does regenration.

- [ ] This new insert mode probably has consequences for how we handle AI requests in general,
      because the currnet system prompt is closely aligned to the rewriting context - and we
      currently always provide "user data" to rewrite. So we either need to adapt the current
      request flow, or create a separate flow for insert mode that provides the appropriate context
      and data to the AI.
