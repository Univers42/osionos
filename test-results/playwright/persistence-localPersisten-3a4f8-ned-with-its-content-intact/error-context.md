# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: persistence/localPersistence.spec.mjs >> local-persistence >> 29. Local persistence / Local pages :: a locally created page survives refresh and can be reopened with its content intact
- Location: tests/e2e/persistence/localPersistence.spec.mjs:18:5

# Error details

```
Error: Sidebar did not become ready after load
```

# Test source

```ts
  1   | import { expect } from "@playwright/test";
  2   | 
  3   | import {
  4   |   activateFirstEditor,
  5   |   clearAndType,
  6   |   clearAndTypePageTitle,
  7   |   focusEditorEnd,
  8   |   getEditors,
  9   |   pageTitleEditor,
  10  | } from "../core/app.mjs";
  11  | import { defineScenario } from "../core/scenario.mjs";
  12  | import { runLocalCommand } from "../core/system.mjs";
  13  | 
  14  | function escapeRegex(value) {
  15  |   return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  16  | }
  17  | 
  18  | function sidebarNewPageButton(page) {
  19  |   return page.locator('button[title="New page"]').first();
  20  | }
  21  | 
  22  | async function waitForSidebarReady(page) {
  23  |   try {
  24  |     await sidebarNewPageButton(page).waitFor({ state: "visible", timeout: 10_000 });
  25  |   } catch {
> 26  |     throw new Error("Sidebar did not become ready after load");
      |           ^ Error: Sidebar did not become ready after load
  27  |   }
  28  | }
  29  | 
  30  | async function openPageFromSidebar(page, title) {
  31  |   const titleEditor = pageTitleEditor(page);
  32  |   if ((await titleEditor.count()) > 0) {
  33  |     const currentTitle = (await titleEditor.textContent()) ?? "";
  34  |     if (currentTitle.includes(title)) {
  35  |       return;
  36  |     }
  37  |   }
  38  | 
  39  |   await waitForSidebarReady(page);
  40  |   const button = page
  41  |     .locator("nav button")
  42  |     .filter({ hasText: new RegExp(escapeRegex(title), "i") })
  43  |     .first();
  44  | 
  45  |   try {
  46  |     await button.waitFor({ state: "visible", timeout: 10_000 });
  47  |   } catch {
  48  |     throw new Error(`Could not find sidebar entry for page "${title}" after reload`);
  49  |   }
  50  | 
  51  |   await button.scrollIntoViewIfNeeded();
  52  |   await button.click();
  53  | 
  54  |   try {
  55  |     await expect(pageTitleEditor(page)).toContainText(title, { timeout: 10_000 });
  56  |   } catch {
  57  |     throw new Error(`Sidebar entry for "${title}" was visible but did not open the page editor`);
  58  |   }
  59  | }
  60  | 
  61  | async function waitForPagesCacheToContain(page, value) {
  62  |   await expect
  63  |     .poll(async () =>
  64  |       page.evaluate(() => localStorage.getItem("pg:pages") ?? ""),
  65  |     )
  66  |     .toContain(value);
  67  | }
  68  | 
  69  | export const persistenceAndQualityScenarios = [
  70  |   defineScenario(
  71  |     "29. Local persistence",
  72  |     "Seeded offline pages",
  73  |     "edits on an offline seeded page survive refresh and remain editable afterwards",
  74  |     async ({ page, appUrl }) => {
  75  |       const token = `persist-${Date.now().toString(36)}`;
  76  |       await page.addInitScript(() => {
  77  |         localStorage.setItem(
  78  |           "pg:pages",
  79  |           JSON.stringify({
  80  |             "mock-ws-private-0": [
  81  |               {
  82  |                 _id: "offline-seed-page",
  83  |                 title: "Getting Started",
  84  |                 workspaceId: "mock-ws-private-0",
  85  |                 ownerId: "mock-user-0",
  86  |                 visibility: "private",
  87  |                 collaborators: [],
  88  |                 parentPageId: null,
  89  |                 databaseId: null,
  90  |                 archivedAt: null,
  91  |                 content: [
  92  |                   {
  93  |                     id: "seed-block-1",
  94  |                     type: "paragraph",
  95  |                     content: "Offline seed body",
  96  |                   },
  97  |                 ],
  98  |               },
  99  |             ],
  100 |           }),
  101 |         );
  102 |         localStorage.setItem("pg:recents", "[]");
  103 |       });
  104 |       await page.route("**/api/**", (route) => route.abort());
  105 |       await page.goto(appUrl, { waitUntil: "networkidle" });
  106 |       await openPageFromSidebar(page, "Getting Started");
  107 |       const editor = await activateFirstEditor(page);
  108 |       await focusEditorEnd(editor);
  109 |       await page.keyboard.type(` ${token}`);
  110 |       await waitForPagesCacheToContain(page, token);
  111 | 
  112 |       await page.reload({ waitUntil: "networkidle" });
  113 |       await openPageFromSidebar(page, "Getting Started");
  114 |       await expect(getEditors(page).first()).toContainText(token);
  115 | 
  116 |       await focusEditorEnd(getEditors(page).first());
  117 |       await page.keyboard.type(" editable");
  118 |       await expect(getEditors(page).first()).toContainText(`${token} editable`);
  119 |     },
  120 |   ),
  121 |   defineScenario(
  122 |     "29. Local persistence",
  123 |     "Local pages",
  124 |     "a locally created page survives refresh and can be reopened with its content intact",
  125 |     async ({ page, appUrl }) => {
  126 |       const title = `Local persistence ${Date.now().toString(36)}`;
```