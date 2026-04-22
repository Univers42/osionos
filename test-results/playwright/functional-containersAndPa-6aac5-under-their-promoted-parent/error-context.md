# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: functional/containersAndPaste.spec.mjs >> containers-and-paste >> 8. Callout & Quote as Containers / Callout :: deleting an empty callout keeps nested grandchildren under their promoted parent
- Location: tests/e2e/functional/containersAndPaste.spec.mjs:16:5

# Error details

```
Error: expect(received).toBeGreaterThan(expected)

Expected: > 575
Received:   510
```

# Page snapshot

```yaml
- generic [ref=e3]:
  - complementary [ref=e4]:
    - generic [ref=e6]:
      - button "⭐ Notion de dylan" [ref=e7] [cursor=pointer]:
        - generic [ref=e9]: ⭐
        - generic [ref=e10]: Notion de dylan
      - generic [ref=e11]:
        - button "New page" [ref=e12] [cursor=pointer]:
          - img [ref=e13]
        - button "Close sidebar" [ref=e16] [cursor=pointer]:
          - img [ref=e17]
        - button "More options" [ref=e20] [cursor=pointer]:
          - img [ref=e21]
    - generic [ref=e23] [cursor=pointer]:
      - button "Search" [ref=e25]:
        - img [ref=e27]
        - generic [ref=e30]: Search
      - button "Home" [ref=e32]:
        - img [ref=e34]
        - generic [ref=e37]: Home
      - button "Meetings" [ref=e39]:
        - img [ref=e41]
        - generic [ref=e44]: Meetings
      - button "Notion AI" [ref=e46]:
        - img [ref=e48]
        - generic [ref=e50]: Notion AI
      - button "Inbox" [ref=e52]:
        - img [ref=e54]
        - generic [ref=e57]: Inbox
      - button "Library" [ref=e59]:
        - img [ref=e61]
        - generic [ref=e63]: Library
      - 'button "Theme: System" [ref=e65]':
        - img [ref=e67]
        - generic [ref=e69]: "Theme: System"
    - navigation [ref=e71]:
      - generic [ref=e72]:
        - generic [ref=e73]:
          - button "Recents" [ref=e75]:
            - generic [ref=e76]: Recents
            - img [ref=e77]
          - generic [ref=e80]:
            - button "Untitled" [ref=e81] [cursor=pointer]:
              - img [ref=e84]
              - generic [ref=e87]: Untitled
            - generic [ref=e90]:
              - button "Page options" [ref=e92]:
                - img [ref=e93]
              - button "Add child page" [ref=e97]:
                - img [ref=e98]
        - generic [ref=e99]:
          - button "Agents" [ref=e101]:
            - generic [ref=e102]: Agents
            - img [ref=e103]
          - button "New agent" [ref=e107] [cursor=pointer]:
            - img [ref=e109]
            - generic [ref=e110]: New agent
        - generic [ref=e111]:
          - generic [ref=e112]:
            - button "Private" [ref=e113]:
              - generic [ref=e114]: Private
              - img [ref=e115]
            - generic [ref=e117]:
              - button "Open menu" [ref=e118]:
                - img [ref=e119]
              - button "Add to Private" [ref=e123]:
                - img [ref=e124]
          - generic [ref=e125]:
            - generic [ref=e126]:
              - img [ref=e129]
              - button "🚀 Getting Started" [ref=e132]:
                - generic [ref=e133]: 🚀
                - generic [ref=e134]: Getting Started
              - generic [ref=e135]:
                - button "Page options" [ref=e137]:
                  - img [ref=e138]
                - button "Add child page" [ref=e142]:
                  - img [ref=e143]
            - generic [ref=e144]:
              - img [ref=e147]
              - button "🧩 Project Roadmap" [ref=e150]:
                - generic [ref=e151]: 🧩
                - generic [ref=e152]: Project Roadmap
              - generic [ref=e153]:
                - button "Page options" [ref=e155]:
                  - img [ref=e156]
                - button "Add child page" [ref=e160]:
                  - img [ref=e161]
            - generic [ref=e162]:
              - img [ref=e165]
              - button "📌 Meeting Notes" [ref=e168]:
                - generic [ref=e169]: 📌
                - generic [ref=e170]: Meeting Notes
              - generic [ref=e171]:
                - button "Page options" [ref=e173]:
                  - img [ref=e174]
                - button "Add child page" [ref=e178]:
                  - img [ref=e179]
            - generic [ref=e180]:
              - img [ref=e183]
              - button "Untitled" [ref=e186]:
                - img [ref=e188]
                - generic [ref=e191]: Untitled
              - generic [ref=e192]:
                - button "Page options" [ref=e194]:
                  - img [ref=e195]
                - button "Add child page" [ref=e199]:
                  - img [ref=e200]
        - generic [ref=e201]:
          - button "Shared" [ref=e203]:
            - generic [ref=e204]: Shared
            - img [ref=e205]
          - generic [ref=e208]:
            - img [ref=e211]
            - button "🧠 Team Wiki" [ref=e214]:
              - generic [ref=e215]: 🧠
              - generic [ref=e216]: Team Wiki
            - generic [ref=e217]:
              - button "Page options" [ref=e219]:
                - img [ref=e220]
              - button "Add child page" [ref=e224]:
                - img [ref=e225]
        - generic [ref=e226]:
          - button "Notion apps" [ref=e228]:
            - generic [ref=e229]: Notion apps
            - img [ref=e230]
          - generic [ref=e232]:
            - button "Notion Mail" [ref=e234] [cursor=pointer]:
              - img [ref=e236]
              - generic [ref=e239]: Notion Mail
            - button "Notion Calendar" [ref=e241] [cursor=pointer]:
              - img [ref=e243]
              - generic [ref=e245]: Notion Calendar
            - button "Notion Desktop" [ref=e247] [cursor=pointer]:
              - img [ref=e249]
              - generic [ref=e251]: Notion Desktop
    - generic [ref=e253]:
      - button "Settings" [ref=e255] [cursor=pointer]:
        - img [ref=e257]
        - generic [ref=e260]: Settings
      - button "Marketplace" [ref=e262] [cursor=pointer]:
        - img [ref=e264]
        - generic [ref=e269]: Marketplace
      - button "Trash" [ref=e271] [cursor=pointer]:
        - img [ref=e273]
        - generic [ref=e276]: Trash
      - 'button "Theme: System" [ref=e278] [cursor=pointer]':
        - img [ref=e280]
        - generic [ref=e282]: "Theme: System"
    - generic [ref=e284] [cursor=pointer]:
      - generic [ref=e285]:
        - img [ref=e286]
        - generic [ref=e289]:
          - paragraph [ref=e290]: Invite members
          - paragraph [ref=e291]: Collaborate with your team.
      - button [ref=e292]:
        - img [ref=e293]
  - main [ref=e296]:
    - generic [ref=e298]:
      - generic [ref=e299]:
        - generic [ref=e300]:
          - button "✨ Add icon" [ref=e301] [cursor=pointer]:
            - generic [ref=e302]: ✨
            - text: Add icon
          - button "Add cover" [ref=e303] [cursor=pointer]:
            - img [ref=e304]
            - text: Add cover
          - button "Add comment" [ref=e307] [cursor=pointer]:
            - img [ref=e308]
            - text: Add comment
        - textbox "Page title" [ref=e310]
      - generic [ref=e312]:
        - generic [ref=e314]:
          - generic [ref=e315]:
            - button "Drag to reorder block" [ref=e316]:
              - img [ref=e317]
            - textbox [active] [ref=e325]
          - generic [ref=e329]:
            - button "Drag to reorder block" [ref=e330]:
              - img [ref=e331]
            - textbox [ref=e339]
        - button "Add a block" [ref=e340]:
          - img [ref=e341]
          - generic [ref=e342]: Add a block
```

# Test source

```ts
  136 |       await clearAndType(child, "Hidden child");
  137 |       await toggleChevron(page).click();
  138 |       await pressTab(child);
  139 |       await expect(getEditors(page)).toHaveCount(1);
  140 |       await toggleChevron(page).click();
  141 |       await expect(getEditors(page)).toHaveCount(2);
  142 |       await expect(getEditors(page).nth(1)).toHaveText("Hidden child");
  143 |     },
  144 |   ),
  145 |   defineScenario(
  146 |     "7. Toggle Block",
  147 |     "Toggle + external interactions",
  148 |     "deleting an empty toggle summary promotes its child blocks to the parent level",
  149 |     async ({ page, appUrl }) => {
  150 |       await openFreshPage(page, appUrl);
  151 |       await createBlockViaSlash(page, "toggle", "Toggle");
  152 |       const summary = getEditors(page).first();
  153 |       await clearAndType(summary, "Summary");
  154 |       await pressEnter(summary);
  155 |       const child = getEditors(page).nth(1);
  156 |       await clearAndType(child, "Promoted child");
  157 |       const childLeft = await editorLeft(child);
  158 |       await clearAndType(summary, "");
  159 |       await summary.press("Backspace");
  160 |       await expect(getEditors(page)).toHaveCount(1);
  161 |       await expect(getEditors(page).first()).toHaveText("Promoted child");
  162 |       expect(await editorLeft(getEditors(page).first())).toBeLessThan(childLeft - 8);
  163 |     },
  164 |   ),
  165 |   defineScenario(
  166 |     "8. Callout & Quote as Containers",
  167 |     "Callout",
  168 |     "callout children are rendered inside the callout box",
  169 |     async ({ page, appUrl }) => {
  170 |       await openFreshPage(page, appUrl);
  171 |       await createBlockViaSlash(page, "callout", "Callout");
  172 |       const callout = getEditors(page).first();
  173 |       await clearAndType(callout, "Callout");
  174 |       await pressEnter(callout);
  175 |       const child = getEditors(page).nth(1);
  176 |       await clearAndType(child, "Nested inside callout");
  177 |       await expect(blockLocatorForEditor(callout).locator("[data-block-id]")).toContainText([
  178 |         "Nested inside callout",
  179 |       ]);
  180 |     },
  181 |   ),
  182 |   defineScenario(
  183 |     "8. Callout & Quote as Containers",
  184 |     "Callout",
  185 |     "indenting a paragraph under a callout renders it as a child inside the container",
  186 |     async ({ page, appUrl }) => {
  187 |       await openFreshPage(page, appUrl);
  188 |       await createBlockViaSlash(page, "callout", "Callout");
  189 |       const callout = getEditors(page).first();
  190 |       await clearAndType(callout, "Callout");
  191 |       await pressEnter(callout);
  192 |       const child = getEditors(page).nth(1);
  193 |       expect(await editorLeft(child)).toBeGreaterThan((await editorLeft(callout)) + 8);
  194 |     },
  195 |   ),
  196 |   defineScenario(
  197 |     "8. Callout & Quote as Containers",
  198 |     "Callout",
  199 |     "slash menu commands work inside callout children",
  200 |     async ({ page, appUrl }) => {
  201 |       await openFreshPage(page, appUrl);
  202 |       await createBlockViaSlash(page, "callout", "Callout");
  203 |       const callout = getEditors(page).first();
  204 |       await clearAndType(callout, "Callout");
  205 |       await pressEnter(callout);
  206 |       const child = getEditors(page).nth(1);
  207 |       await child.waitFor();
  208 |       await openSlashMenuFromEditor(child, "/");
  209 |       await expect(slashMenu(page)).toContainText("Heading");
  210 |     },
  211 |   ),
  212 |   defineScenario(
  213 |     "8. Callout & Quote as Containers",
  214 |     "Callout",
  215 |     "deleting an empty callout keeps nested grandchildren under their promoted parent",
  216 |     async ({ page, appUrl }) => {
  217 |       await openFreshPage(page, appUrl);
  218 |       await createBlockViaSlash(page, "callout", "Callout");
  219 |       const callout = getEditors(page).first();
  220 |       await clearAndType(callout, "Callout");
  221 |       await pressEnter(callout);
  222 |       const parentChild = getEditors(page).nth(1);
  223 |       await clearAndType(parentChild, "Parent child");
  224 |       await pressEnter(parentChild);
  225 |       const secondChild = getEditors(page).nth(2);
  226 |       await clearAndType(secondChild, "Grandchild");
  227 |       await pressTab(secondChild);
  228 |       const nestedLeftBefore = await editorLeft(secondChild);
  229 |       await clearAndType(callout, "");
  230 |       await callout.press("Backspace");
  231 |       await expect(getEditors(page).first()).toHaveText("Parent child");
  232 |       await expect(getEditors(page).nth(1)).toHaveText("Grandchild");
  233 |       expect(await editorLeft(getEditors(page).nth(1))).toBeGreaterThan(
  234 |         (await editorLeft(getEditors(page).first())) + 8,
  235 |       );
> 236 |       expect(await editorLeft(getEditors(page).nth(1))).toBeGreaterThan(nestedLeftBefore - 4);
      |                                                         ^ Error: expect(received).toBeGreaterThan(expected)
  237 |     },
  238 |   ),
  239 |   defineScenario(
  240 |     "8. Callout & Quote as Containers",
  241 |     "Callout",
  242 |     "deleting an empty callout promotes its children instead of deleting their content",
  243 |     async ({ page, appUrl }) => {
  244 |       await openFreshPage(page, appUrl);
  245 |       await createBlockViaSlash(page, "callout", "Callout");
  246 |       const callout = getEditors(page).first();
  247 |       await clearAndType(callout, "Callout");
  248 |       await pressEnter(callout);
  249 |       const child = getEditors(page).nth(1);
  250 |       await clearAndType(child, "Promoted child");
  251 |       const childLeft = await editorLeft(child);
  252 |       await clearAndType(callout, "");
  253 |       await callout.press("Backspace");
  254 |       await expect(getEditors(page)).toHaveCount(1);
  255 |       await expect(getEditors(page).first()).toHaveText("Promoted child");
  256 |       expect(await editorLeft(getEditors(page).first())).toBeLessThan(childLeft - 8);
  257 |     },
  258 |   ),
  259 |   defineScenario(
  260 |     "8. Callout & Quote as Containers",
  261 |     "Quote",
  262 |     "quote children are rendered inside the quote branch",
  263 |     async ({ page, appUrl }) => {
  264 |       await openFreshPage(page, appUrl);
  265 |       await createBlockViaSlash(page, "quote", "Quote");
  266 |       const quote = getEditors(page).first();
  267 |       await clearAndType(quote, "Quote");
  268 |       await pressEnter(quote);
  269 |       const child = getEditors(page).nth(1);
  270 |       await clearAndType(child, "Nested inside quote");
  271 |       await expect(blockLocatorForEditor(quote).locator("[data-block-id]")).toContainText([
  272 |         "Nested inside quote",
  273 |       ]);
  274 |     },
  275 |   ),
  276 |   defineScenario(
  277 |     "8. Callout & Quote as Containers",
  278 |     "Quote",
  279 |     "a quote can contain multiple child blocks rendered inside the quote branch",
  280 |     async ({ page, appUrl }) => {
  281 |       await openFreshPage(page, appUrl);
  282 |       await createBlockViaSlash(page, "quote", "Quote");
  283 |       const quote = getEditors(page).first();
  284 |       await clearAndType(quote, "Quote");
  285 |       await pressEnter(quote);
  286 |       const firstChild = getEditors(page).nth(1);
  287 |       await clearAndType(firstChild, "Child 1");
  288 |       await pressEnter(firstChild);
  289 |       const secondChild = getEditors(page).nth(2);
  290 |       await clearAndType(secondChild, "Child 2");
  291 |       const quoteLeft = await editorLeft(quote);
  292 |       expect(await editorLeft(firstChild)).toBeGreaterThan(quoteLeft + 8);
  293 |       expect(await editorLeft(secondChild)).toBeGreaterThan(quoteLeft + 8);
  294 |       await expect(getEditors(page)).toHaveCount(3);
  295 |     },
  296 |   ),
  297 |   defineScenario(
  298 |     "8. Callout & Quote as Containers",
  299 |     "Quote",
  300 |     "deleting an empty quote promotes its children according to editor rules",
  301 |     async ({ page, appUrl }) => {
  302 |       await openFreshPage(page, appUrl);
  303 |       await createBlockViaSlash(page, "quote", "Quote");
  304 |       const quote = getEditors(page).first();
  305 |       await clearAndType(quote, "Quote");
  306 |       await pressEnter(quote);
  307 |       const child = getEditors(page).nth(1);
  308 |       await clearAndType(child, "Promoted quote child");
  309 |       const childLeft = await editorLeft(child);
  310 |       await clearAndType(quote, "");
  311 |       await quote.press("Backspace");
  312 |       await expect(getEditors(page)).toHaveCount(1);
  313 |       await expect(getEditors(page).first()).toHaveText("Promoted quote child");
  314 |       expect(await editorLeft(getEditors(page).first())).toBeLessThan(childLeft - 8);
  315 |     },
  316 |   ),
  317 |   defineScenario(
  318 |     "10. Paste Handling",
  319 |     "Paste handling",
  320 |     "pasting multiline markdown creates multiple corresponding blocks",
  321 |     async ({ page, appUrl }) => {
  322 |       await openFreshPage(page, appUrl);
  323 |       const editor = await activateFirstEditor(page);
  324 |       await pasteText(editor, "# Title\n\nParagraph\n\n- Item");
  325 |       await expect(getEditors(page)).toHaveCount(3);
  326 |       await expect(getEditors(page).first()).toHaveText("Title");
  327 |       await expect(page.locator(".rounded-full")).toHaveCount(1);
  328 |     },
  329 |     { serial: true },
  330 |   ),
  331 |   defineScenario(
  332 |     "10. Paste Handling",
  333 |     "Paste handling",
  334 |     "pasting a fenced code block creates a code block with the pasted content",
  335 |     async ({ page, appUrl }) => {
  336 |       await openFreshPage(page, appUrl);
```