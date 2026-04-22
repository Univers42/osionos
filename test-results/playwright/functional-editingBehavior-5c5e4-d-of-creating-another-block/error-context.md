# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: functional/editingBehavior.spec.mjs >> editing-behavior >> 3. Enter Key Behavior / Standard blocks :: pressing Enter inside a code block inserts a newline instead of creating another block
- Location: tests/e2e/functional/editingBehavior.spec.mjs:16:5

# Error details

```
Error: expect(locator).toHaveValue(expected) failed

Locator: locator('textarea')
Timeout: 10000ms
- Expected  - 1
+ Received  + 1

+
  const a = 1;
-

Call log:
  - Expect "toHaveValue" with timeout 10000ms
  - waiting for locator('textarea')
    14 × locator resolved to <textarea spellcheck="false" placeholder="Code…" class="w-full min-h-[120px] text-[13px] leading-relaxed font-mono text-[var(--color-ink)] whitespace-pre bg-transparent outline-none resize-y">↵const a = 1;</textarea>
       - unexpected value "
const a = 1;"

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
        - generic [ref=e315]:
          - button "Drag to reorder block" [ref=e316]:
            - img [ref=e317]
          - generic [ref=e325]:
            - button "typescript" [ref=e328]
            - generic [ref=e329]:
              - textbox "Code…" [active] [ref=e330]: const a = 1;
              - generic [ref=e331]:
                - paragraph [ref=e332]: Syntax preview
                - code [ref=e334]: const a = 1;
        - button "Add a block" [ref=e335]:
          - img [ref=e336]
          - generic [ref=e337]: Add a block
```

# Test source

```ts
  15  | import {
  16  |   activateFirstEditor,
  17  |   blockLocatorForEditor,
  18  |   clearAndType,
  19  |   createBlockViaSlash,
  20  |   createDivider,
  21  |   createParagraphs,
  22  |   editorHasFocus,
  23  |   editorLeft,
  24  |   getEditors,
  25  |   openSlashMenuFromEditor,
  26  |   openFreshPage,
  27  |   pressEnter,
  28  |   pressTab,
  29  |   waitForRenderStability,
  30  | } from "../core/app.mjs";
  31  | import { defineScenario } from "../core/scenario.mjs";
  32  | 
  33  | function todoCheckboxes(page) {
  34  |   return page.locator("button.w-4.h-4");
  35  | }
  36  | 
  37  | async function createBulletedListItem(page, text) {
  38  |   await createBlockViaSlash(page, "bullet", "Bulleted List");
  39  |   const editor = getEditors(page).first();
  40  |   await clearAndType(editor, text);
  41  |   await expect(blockLocatorForEditor(editor).locator(".rounded-full")).toHaveCount(1);
  42  |   await waitForRenderStability(page);
  43  |   return editor;
  44  | }
  45  | 
  46  | async function createNumberedListItem(page, text) {
  47  |   await createBlockViaSlash(page, "numbered", "Numbered List");
  48  |   const editor = getEditors(page).first();
  49  |   await clearAndType(editor, text);
  50  |   await expect(editor).toHaveText(text);
  51  |   await expect(blockLocatorForEditor(editor)).toContainText("1.");
  52  |   await waitForRenderStability(page);
  53  |   return editor;
  54  | }
  55  | 
  56  | async function createTodoListItem(page, text) {
  57  |   const editor = await activateFirstEditor(page);
  58  |   await openSlashMenuFromEditor(editor, "[] ");
  59  |   await expect(blockLocatorForEditor(editor).locator("button.w-4.h-4")).toHaveCount(1);
  60  |   await waitForRenderStability(page);
  61  |   await clearAndType(editor, text);
  62  |   await waitForRenderStability(page);
  63  |   return editor;
  64  | }
  65  | 
  66  | export const editingBehaviorScenarios = [
  67  |   defineScenario(
  68  |     "3. Enter Key Behavior",
  69  |     "Standard blocks",
  70  |     "pressing Enter in a paragraph creates a new paragraph below and moves focus to it",
  71  |     async ({ page, appUrl }) => {
  72  |       await openFreshPage(page, appUrl);
  73  |       const editor = await activateFirstEditor(page);
  74  |       await clearAndType(editor, "Paragraph");
  75  |       await pressEnter(editor);
  76  |       const second = getEditors(page).nth(1);
  77  |       await second.waitFor();
  78  |       await expect.poll(async () => editorHasFocus(second)).toBe(true);
  79  |       await expect(second).toHaveText("");
  80  |     },
  81  |   ),
  82  |   defineScenario(
  83  |     "3. Enter Key Behavior",
  84  |     "Standard blocks",
  85  |     "pressing Enter in a heading creates a normal paragraph below",
  86  |     async ({ page, appUrl }) => {
  87  |       await openFreshPage(page, appUrl);
  88  |       const editor = await activateFirstEditor(page);
  89  |       await clearAndType(editor, "# ");
  90  |       await page.keyboard.type("Heading");
  91  |       await pressEnter(editor);
  92  |       const second = getEditors(page).nth(1);
  93  |       await second.waitFor();
  94  |       const fontSize = await second.evaluate((node) =>
  95  |         Number.parseFloat(getComputedStyle(node).fontSize),
  96  |       );
  97  |       expect(fontSize).toBeLessThan(20);
  98  |       await expect.poll(async () => editorHasFocus(second)).toBe(true);
  99  |     },
  100 |   ),
  101 |   defineScenario(
  102 |     "3. Enter Key Behavior",
  103 |     "Standard blocks",
  104 |     "pressing Enter inside a code block inserts a newline instead of creating another block",
  105 |     async ({ page, appUrl }) => {
  106 |       await openFreshPage(page, appUrl);
  107 |       await createBlockViaSlash(page, "code", "Code");
  108 |       const textarea = page.locator("textarea");
  109 |       await textarea.fill("const a = 1;");
  110 |       await textarea.evaluate((node) => {
  111 |         node.focus();
  112 |         node.setSelectionRange(node.value.length, node.value.length);
  113 |       });
  114 |       await textarea.press("Enter");
> 115 |       await expect(textarea).toHaveValue("const a = 1;\n");
      |                              ^ Error: expect(locator).toHaveValue(expected) failed
  116 |       await expect(page.locator("textarea")).toHaveCount(1);
  117 |     },
  118 |   ),
  119 |   defineScenario(
  120 |     "3. Enter Key Behavior",
  121 |     "List continuation",
  122 |     "pressing Enter in a bulleted list item creates a new bullet below",
  123 |     async ({ page, appUrl }) => {
  124 |       await openFreshPage(page, appUrl);
  125 |       const editor = await createBulletedListItem(page, "Bullet");
  126 |       await pressEnter(editor);
  127 |       await expect(getEditors(page)).toHaveCount(2);
  128 |       await expect(
  129 |         blockLocatorForEditor(getEditors(page).nth(1)).locator(".rounded-full"),
  130 |       ).toHaveCount(1);
  131 |     },
  132 |   ),
  133 |   defineScenario(
  134 |     "3. Enter Key Behavior",
  135 |     "List continuation",
  136 |     "pressing Enter in a numbered list item creates the next number",
  137 |     async ({ page, appUrl }) => {
  138 |       await openFreshPage(page, appUrl);
  139 |       const editor = await createNumberedListItem(page, "First");
  140 |       await pressEnter(editor);
  141 |       await expect(getEditors(page)).toHaveCount(2);
  142 |       await expect(blockLocatorForEditor(getEditors(page).nth(1))).toContainText("2.");
  143 |     },
  144 |   ),
  145 |   defineScenario(
  146 |     "3. Enter Key Behavior",
  147 |     "List continuation",
  148 |     "pressing Enter in a to-do item creates a new unchecked to-do below",
  149 |     async ({ page, appUrl }) => {
  150 |       await openFreshPage(page, appUrl);
  151 |       const editor = await createTodoListItem(page, "Task");
  152 |       await pressEnter(editor);
  153 |       await expect(getEditors(page)).toHaveCount(2);
  154 |       await expect(
  155 |         blockLocatorForEditor(getEditors(page).nth(1)).locator("button.w-4.h-4"),
  156 |       ).toHaveCount(1);
  157 |     },
  158 |   ),
  159 |   defineScenario(
  160 |     "3. Enter Key Behavior",
  161 |     "List continuation",
  162 |     "pressing Enter on a checked empty to-do item converts it into a paragraph and clears the checked state",
  163 |     async ({ page, appUrl }) => {
  164 |       await openFreshPage(page, appUrl);
  165 |       const editor = await createTodoListItem(page, "Task");
  166 |       await pressEnter(editor);
  167 |       const emptyItem = getEditors(page).nth(1);
  168 |       await emptyItem.waitFor();
  169 |       const emptyItemCheckbox = blockLocatorForEditor(emptyItem).locator("button.w-4.h-4");
  170 |       await expect(todoCheckboxes(page)).toHaveCount(2);
  171 |       await expect(emptyItemCheckbox).toHaveCount(1);
  172 |       await emptyItemCheckbox.click({ force: true });
  173 |       await waitForRenderStability(page);
  174 |       await pressEnter(emptyItem);
  175 |       await expect(todoCheckboxes(page)).toHaveCount(1);
  176 |       await expect(getEditors(page)).toHaveCount(2);
  177 |       await expect(
  178 |         blockLocatorForEditor(getEditors(page).nth(1)).locator("button.w-4.h-4"),
  179 |       ).toHaveCount(0);
  180 |     },
  181 |   ),
  182 |   defineScenario(
  183 |     "3. Enter Key Behavior",
  184 |     "List continuation",
  185 |     "pressing Enter on an empty bulleted list item converts it into a paragraph",
  186 |     async ({ page, appUrl }) => {
  187 |       await openFreshPage(page, appUrl);
  188 |       const editor = await createBulletedListItem(page, "Bullet");
  189 |       await pressEnter(editor);
  190 |       const emptyItem = getEditors(page).nth(1);
  191 |       await emptyItem.waitFor();
  192 |       await expect(blockLocatorForEditor(emptyItem).locator(".rounded-full")).toHaveCount(1);
  193 |       await pressEnter(emptyItem);
  194 |       await expect(blockLocatorForEditor(getEditors(page).nth(1)).locator(".rounded-full")).toHaveCount(0);
  195 |       await expect(getEditors(page)).toHaveCount(2);
  196 |     },
  197 |   ),
  198 |   defineScenario(
  199 |     "3. Enter Key Behavior",
  200 |     "List continuation",
  201 |     "pressing Enter on an empty numbered list item converts it into a paragraph",
  202 |     async ({ page, appUrl }) => {
  203 |       await openFreshPage(page, appUrl);
  204 |       const editor = await createNumberedListItem(page, "First");
  205 |       await pressEnter(editor);
  206 |       const emptyItem = getEditors(page).nth(1);
  207 |       await emptyItem.waitFor();
  208 |       await expect(blockLocatorForEditor(emptyItem)).toContainText("2.");
  209 |       await pressEnter(emptyItem);
  210 |       await expect(blockLocatorForEditor(getEditors(page).nth(1))).not.toContainText("2.");
  211 |       await expect(getEditors(page)).toHaveCount(2);
  212 |     },
  213 |   ),
  214 |   defineScenario(
  215 |     "3. Enter Key Behavior",
```