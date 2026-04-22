# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: functional/indentation.spec.mjs >> indentation >> 2. Indentation (Tab / Shift+Tab) / Type-specific indentation :: pressing Tab inside a code block inserts spaces instead of changing hierarchy
- Location: tests/e2e/functional/indentation.spec.mjs:16:5

# Error details

```
Error: expect(locator).toHaveValue(expected) failed

Locator:  locator('textarea')
Expected: "const value = 1;    "
Received: "    const value = 1;"
Timeout:  10000ms

Call log:
  - Expect "toHaveValue" with timeout 10000ms
  - waiting for locator('textarea')
    14 × locator resolved to <textarea spellcheck="false" placeholder="Code…" class="w-full min-h-[120px] text-[13px] leading-relaxed font-mono text-[var(--color-ink)] whitespace-pre bg-transparent outline-none resize-y">    const value = 1;</textarea>
       - unexpected value "    const value = 1;"

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
              - textbox "Code…" [active] [ref=e330]: const value = 1;
              - generic [ref=e331]:
                - paragraph [ref=e332]: Syntax preview
                - code [ref=e334]: const value = 1;
        - button "Add a block" [ref=e335]:
          - img [ref=e336]
          - generic [ref=e337]: Add a block
```

# Test source

```ts
  132 |       const fontSize = await headingEditor.evaluate((node) =>
  133 |         Number.parseFloat(getComputedStyle(node).fontSize),
  134 |       );
  135 |       expect(await editorLeft(headingEditor)).toBeGreaterThan(before + 8);
  136 |       expect(fontSize).toBeGreaterThan(20);
  137 |     },
  138 |   ),
  139 |   defineScenario(
  140 |     "2. Indentation (Tab / Shift+Tab)",
  141 |     "Type-specific indentation",
  142 |     "a paragraph cannot be indented under a heading",
  143 |     async ({ page, appUrl }) => {
  144 |       await openFreshPage(page, appUrl);
  145 |       const first = await activateFirstEditor(page);
  146 |       await clearAndType(first, "# ");
  147 |       await page.keyboard.type("Heading parent");
  148 |       await pressEnter(first);
  149 |       const child = getEditors(page).nth(1);
  150 |       await clearAndType(child, "Paragraph child");
  151 |       const before = await editorLeft(child);
  152 |       await pressTab(child);
  153 |       expectNearlyEqual(await editorLeft(child), before);
  154 |     },
  155 |   ),
  156 |   defineScenario(
  157 |     "2. Indentation (Tab / Shift+Tab)",
  158 |     "Type-specific indentation",
  159 |     "a paragraph cannot be indented under a code block",
  160 |     async ({ page, appUrl }) => {
  161 |       await openFreshPage(page, appUrl);
  162 |       await createParagraphs(page, ["Code host", "Paragraph child"]);
  163 |       const first = getEditors(page).first();
  164 |       await openSlashMenuFromEditor(first, "/code");
  165 |       await selectSlashMenuEntry(page, "^Code$");
  166 |       const child = getEditors(page).first();
  167 |       const before = await editorLeft(child);
  168 |       await pressTab(child);
  169 |       expectNearlyEqual(await editorLeft(child), before);
  170 |     },
  171 |   ),
  172 |   defineScenario(
  173 |     "2. Indentation (Tab / Shift+Tab)",
  174 |     "Type-specific indentation",
  175 |     "a paragraph cannot be indented under a divider",
  176 |     async ({ page, appUrl }) => {
  177 |       await openFreshPage(page, appUrl);
  178 |       await createParagraphs(page, ["Divider host", "Paragraph child"]);
  179 |       const first = getEditors(page).first();
  180 |       await openSlashMenuFromEditor(first, "/divider");
  181 |       await selectSlashMenuEntry(page, "^Divider$");
  182 |       const child = getEditors(page).first();
  183 |       const before = await editorLeft(child);
  184 |       await pressTab(child);
  185 |       expectNearlyEqual(await editorLeft(child), before);
  186 |     },
  187 |   ),
  188 |   defineScenario(
  189 |     "2. Indentation (Tab / Shift+Tab)",
  190 |     "Type-specific indentation",
  191 |     "a paragraph can be indented under a callout container",
  192 |     async ({ page, appUrl }) => {
  193 |       await openFreshPage(page, appUrl);
  194 |       await createParagraphs(page, ["Container host", "Indented child"]);
  195 |       const first = getEditors(page).first();
  196 |       const child = getEditors(page).nth(1);
  197 |       const before = await editorLeft(child);
  198 |       await openSlashMenuFromEditor(first, "/callout");
  199 |       await selectSlashMenuEntry(page, "^Callout$");
  200 |       await pressTab(child);
  201 |       expect(await editorLeft(child)).toBeGreaterThan(before + 8);
  202 |       await expect(page.getByRole("button", { name: "Change callout icon" })).toBeVisible();
  203 |     },
  204 |   ),
  205 |   defineScenario(
  206 |     "2. Indentation (Tab / Shift+Tab)",
  207 |     "Type-specific indentation",
  208 |     "a paragraph can be indented under a quote container",
  209 |     async ({ page, appUrl }) => {
  210 |       await openFreshPage(page, appUrl);
  211 |       await createParagraphs(page, ["Quote host", "Indented child"]);
  212 |       const first = getEditors(page).first();
  213 |       const child = getEditors(page).nth(1);
  214 |       const before = await editorLeft(child);
  215 |       await openSlashMenuFromEditor(first, "/quote");
  216 |       await selectSlashMenuEntry(page, "^Quote$");
  217 |       await pressTab(child);
  218 |       expect(await editorLeft(child)).toBeGreaterThan(before + 8);
  219 |     },
  220 |   ),
  221 |   defineScenario(
  222 |     "2. Indentation (Tab / Shift+Tab)",
  223 |     "Type-specific indentation",
  224 |     "pressing Tab inside a code block inserts spaces instead of changing hierarchy",
  225 |     async ({ page, appUrl }) => {
  226 |       await openFreshPage(page, appUrl);
  227 |       await createCodeBlock(page);
  228 |       const textarea = page.locator("textarea");
  229 |       await textarea.fill("const value = 1;");
  230 |       await textarea.click();
  231 |       await page.keyboard.press("Tab");
> 232 |       await expect(textarea).toHaveValue("const value = 1;    ");
      |                              ^ Error: expect(locator).toHaveValue(expected) failed
  233 |       await expect(getEditors(page)).toHaveCount(0);
  234 |     },
  235 |   ),
  236 | ];
  237 | 
```