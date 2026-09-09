- [ ] The slash menu should have higher z index than toolbar (its now below sticky toolbar)
- [ ] Make the slash menu max height 48 dvh. Keep the overflow scroll. Eg we want to make sure the
      entire content menu is always visible, regardless of alignment

- [ ] If a :Reference snapshot is outdated, we should also indicate the somewhere in the reference
      drawer - not just in the reference report. The reference report can be dismissed

- [ ] The reference report is being displayed at times when it shouldnt. I havent been able to
      consistently reproduce it. The goal is to have the reference report only be activated when an
      item page is mounted, and the editor interface is hydrated for the first time. However, it
      sometimes appears unexpectedly, for example when doing regular edits (i think related to @
      trigger but not sure). And if an item is published while still have stale references, after
      published (eg if the diff view diseappers) its also displayed. But maybe thats to be expected.

- [ ] We have implemented a nice sub toolbar banner, that is currently used to display warning like
      "Component meta data could not be loaded. Markdown editing is still available". Ik think we
      shoudl make this 'notice bar' multi purpose. We could also use it to show: "Some item
      references need attention." with a x-small action button: "Show report". That action is then
      the only way to open the report modal. Which basically solves our previous issue, because the
      report modal is no longer tied to vue lifecycle

- [ ] The reference status indicators should be short (im not sure which statusses there are
      exactly). But for example: "Snapshot outdated" should just be "outdated". Editors dont know
      what a snapshot is.

- [ ] Instead, the modal description should have a short explanation: "Some references in this item
      need attention, because the item that is being referenced has changed since your last edit."

- [ ] In the previous taks, this was not fixed: "Can we make the reference report modal wider? like
      75vw for > 768px screens? Its pretty small currently"
