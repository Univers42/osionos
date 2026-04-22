# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: functional/categoryRegistry.spec.mjs >> category-registry >> 27. Block Category Registry / NON_INDENTABLE :: blocks marked as non-indentable keep Tab behavior local instead of structural
- Location: tests/e2e/functional/categoryRegistry.spec.mjs:16:5

# Error details

```
Error: expect(locator).toHaveValue(expected) failed

Locator:  locator('textarea')
Expected: "const registry = true;    "
Received: "    const registry = true;"
Timeout:  10000ms

Call log:
  - Expect "toHaveValue" with timeout 10000ms
  - waiting for locator('textarea')
    14 × locator resolved to <textarea spellcheck="false" placeholder="Code…" class="w-full min-h-[120px] text-[13px] leading-relaxed font-mono text-[var(--color-ink)] whitespace-pre bg-transparent outline-none resize-y">    const registry = true;</textarea>
       - unexpected value "    const registry = true;"

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
              - textbox "Code…" [active] [ref=e330]: const registry = true;
              - generic [ref=e331]:
                - paragraph [ref=e332]: Syntax preview
                - code [ref=e334]: const registry = true;
        - button "Add a block" [ref=e335]:
          - img [ref=e336]
          - generic [ref=e337]: Add a block
```

# Test source

```ts
  1  | /* ************************************************************************** */
  2  | /*                                                                            */
  3  | /*                                                        :::      ::::::::   */
  4  | /*   categoryRegistry.mjs                               :+:      :+:    :+:   */
  5  | /*                                                    +:+ +:+         +:+     */
  6  | /*   By: rstancu <rstancu@student.42madrid.com>     +#+  +:+       +#+        */
  7  | /*                                                +#+#+#+#+#+   +#+           */
  8  | /*   Created: 2026/04/20 21:29:41 by rstancu           #+#    #+#             */
  9  | /*   Updated: 2026/04/20 21:29:42 by rstancu          ###   ########.fr       */
  10 | /*                                                                            */
  11 | /* ************************************************************************** */
  12 | 
  13 | import { expect } from "@playwright/test";
  14 | 
  15 | import {
  16 |   activateFirstEditor,
  17 |   clearAndType,
  18 |   createBlockViaSlash,
  19 |   createCodeBlock,
  20 |   createParagraphs,
  21 |   editorLeft,
  22 |   getEditors,
  23 |   openFreshPage,
  24 |   pressEnter,
  25 |   pressTab,
  26 | } from "../core/app.mjs";
  27 | import { defineScenario } from "../core/scenario.mjs";
  28 | 
  29 | function expectNearlyEqual(left, right, delta = 2) {
  30 |   expect(Math.abs(left - right)).toBeLessThanOrEqual(delta);
  31 | }
  32 | 
  33 | export const categoryRegistryScenarios = [
  34 |   defineScenario(
  35 |     "27. Block Category Registry",
  36 |     "NON_PARENTABLE",
  37 |     "blocks marked as non-parentable reject child indentation via Tab",
  38 |     async ({ page, appUrl }) => {
  39 |       await openFreshPage(page, appUrl);
  40 |       const parent = await activateFirstEditor(page);
  41 |       await clearAndType(parent, "# ");
  42 |       await page.keyboard.type("Heading parent");
  43 |       await pressEnter(parent);
  44 |       const child = getEditors(page).nth(1);
  45 |       await clearAndType(child, "Paragraph child");
  46 |       const before = await editorLeft(child);
  47 |       await pressTab(child);
  48 |       expectNearlyEqual(await editorLeft(child), before);
  49 |     },
  50 |   ),
  51 |   defineScenario(
  52 |     "27. Block Category Registry",
  53 |     "NON_INDENTABLE",
  54 |     "blocks marked as non-indentable keep Tab behavior local instead of structural",
  55 |     async ({ page, appUrl }) => {
  56 |       await openFreshPage(page, appUrl);
  57 |       await createCodeBlock(page);
  58 |       const textarea = page.locator("textarea");
  59 |       await textarea.fill("const registry = true;");
  60 |       await textarea.click();
  61 |       await page.keyboard.press("Tab");
> 62 |       await expect(textarea).toHaveValue("const registry = true;    ");
     |                              ^ Error: expect(locator).toHaveValue(expected) failed
  63 |       await expect(getEditors(page)).toHaveCount(0);
  64 |     },
  65 |   ),
  66 |   defineScenario(
  67 |     "27. Block Category Registry",
  68 |     "enterCreatesChild",
  69 |     "blocks marked enterCreatesChild create nested children on Enter",
  70 |     async ({ page, appUrl }) => {
  71 |       await openFreshPage(page, appUrl);
  72 |       await createBlockViaSlash(page, "callout", "Callout");
  73 |       const parent = getEditors(page).first();
  74 |       await clearAndType(parent, "Parent");
  75 |       const before = await editorLeft(parent);
  76 |       await pressEnter(parent);
  77 |       expect(await editorLeft(getEditors(page).nth(1))).toBeGreaterThan(before + 8);
  78 |     },
  79 |   ),
  80 |   defineScenario(
  81 |     "27. Block Category Registry",
  82 |     "sibling enter behavior",
  83 |     "blocks not marked enterCreatesChild create siblings rather than nested children",
  84 |     async ({ page, appUrl }) => {
  85 |       await openFreshPage(page, appUrl);
  86 |       const editor = await activateFirstEditor(page);
  87 |       await clearAndType(editor, "Paragraph");
  88 |       const before = await editorLeft(editor);
  89 |       await pressEnter(editor);
  90 |       expectNearlyEqual(await editorLeft(getEditors(page).nth(1)), before);
  91 |     },
  92 |   ),
  93 | ];
  94 | 
```