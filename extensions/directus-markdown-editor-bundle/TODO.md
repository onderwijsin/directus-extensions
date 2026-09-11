- [ ] the replace scope AI feature doesnt really work well yet. Especially not when selection
      multiple nodes or non paragraph content. Needs further investigation into what goes wrong and
      why

- [ ] The document diff view (document scope ai) needs to render the markdown, not the plain text
      string

- [ ] There is a failing test

```
 FAIL   node  extensions/directus-markdown-editor-bundle/__tests__/ai.test.ts > editor AI domain > inserts generated Markdown directly at an empty range
Error: [tiptap error]: there is no window object available, so this function cannot be used
 ❯ elementFromString node_modules/.pnpm/@tiptap+core@3.31.0_@tiptap+pm@3.31.0/node_modules/@tiptap/core/src/utilities/elementFromString.ts:19:10
 ❯ createNodeFromContent node_modules/.pnpm/@tiptap+core@3.31.0_@tiptap+pm@3.31.0/node_modules/@tiptap/core/src/helpers/createNodeFromContent.ts:124:24
 ❯ createDocument node_modules/.pnpm/@tiptap+core@3.31.0_@tiptap+pm@3.31.0/node_modules/@tiptap/core/src/helpers/createDocument.ts:19:9
 ❯ Editor.createDoc node_modules/.pnpm/@tiptap+core@3.31.0_@tiptap+pm@3.31.0/node_modules/@tiptap/core/src/Editor.ts:521:12
 ❯ new Editor node_modules/.pnpm/@tiptap+core@3.31.0_@tiptap+pm@3.31.0/node_modules/@tiptap/core/src/Editor.ts:150:28
 ❯ extensions/directus-markdown-editor-bundle/__tests__/ai.test.ts:285:18
    283|
    284|  it('inserts generated Markdown directly at an empty range', () => {
    285|   const editor = new Editor({
       |                  ^
    286|    content: '',
    287|    extensions: createEditorExtensions(),

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed | 121 passed (122)
      Tests  1 failed | 938 passed (939)
   Start at  11:38:10
   Duration  8.25s (transform 7.56s, setup 1.30s, import 55.26s, tests 5.93s, environment 2.42s)
```
