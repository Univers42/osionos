/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   containersAndPaste.mjs                             :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/20 21:29:45 by rstancu           #+#    #+#             */
/*   Updated: 2026/05/11 23:43:50 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  activateFirstEditor,
  blockLocatorForEditor,
  clearAndType,
  contextMenuItem,
  createBlockViaSlash,
  editorLeft,
  getCodeTextarea,
  getCodeTextareas,
  getEditors,
  openBlockContextMenuForEditor,
  openFreshPage,
  openSlashMenuFromEditor,
  pasteText,
  pasteTextAtCurrentCaret,
  pressEnter,
  pressTab,
  setCaretInsideText,
  slashMenu,
} from "../core/app.mjs";
import { defineScenario } from "../core/scenario.mjs";

const currentDir = dirname(fileURLToPath(import.meta.url));
const AUTH_ENVIRONMENT_FULL_MARKDOWN = readFileSync(
  resolve(currentDir, "../../canvas/fixtures/auth-environment.md"),
  "utf8",
);

function toggleChevron(page) {
  return page
    .locator("[data-block-id]")
    .first()
    .locator('button:not([title="Drag to reorder"])')
    .first();
}

const AUTH_ENVIRONMENT_OPENING_MARKDOWN = [
  "# Authentication environment and production transition",
  "",
  "Last updated: 2026-05-10",
  "",
  "`opposite-osiris` is currently an Astro/Vite frontend. The auth client is implemented in a React-compatible hook-style module at `opposite-osiris/src/hooks/useAuth.ts`, but it has no React runtime dependency so the existing Astro build stays lightweight.",
  "",
  "## Development variables",
  "",
  "The Docker bootstrap writes these local development values to `apps/opposite-osiris/.env.local`:",
  "",
  "```dotenv",
  "PUBLIC_AUTH_GATEWAY_URL=/api/auth",
  "PUBLIC_PORTAL_URL=http://localhost:3001",
  "PUBLIC_TURNSTILE_SITE_KEY=1x00000000000000000000AA",
  "TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA",
  "TURNSTILE_BYPASS_LOCAL=true",
  "PUBLIC_SITE_URL=http://localhost:4322",
  "```",
  "",
  "The public site key is safe for browser code. The Turnstile secret must only be read by the auth gateway or production backend. Generate the ignored file with Dockerized Node from the repository root:",
  "",
  "```sh",
  "docker run --rm -v \"$PWD\":/workspace -w /workspace node:22-alpine node apps/grobase/scripts/env/bootstrap-env.mjs",
  "```",
  "",
  "## Local runtime",
].join("\n");

async function getRenderedBlockTypes(page) {
  return page.locator("[data-block-id]").evaluateAll((nodes) =>
    nodes.map((node) => node.dataset.blockType),
  );
}

export const containerAndPasteScenarios = [
  defineScenario(
    "7. Toggle Block",
    "Basic toggle behavior",
    "an empty expanded toggle shows the Empty toggle hint",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      await createBlockViaSlash(page, "toggle", "Toggle");
      await expect(page.getByText("Empty toggle")).toBeVisible();
      await expect(getEditors(page)).toHaveCount(1);
    },
  ),
  defineScenario(
    "7. Toggle Block",
    "Basic toggle behavior",
    "clicking the chevron collapses and re-expands toggle children without losing them",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      await createBlockViaSlash(page, "toggle", "Toggle");
      const summary = getEditors(page).first();
      await clearAndType(summary, "Summary");
      await pressEnter(summary);
      const child = getEditors(page).nth(1);
      await clearAndType(child, "Nested child");
      await toggleChevron(page).click();
      await expect(getEditors(page)).toHaveCount(1);
      await toggleChevron(page).click();
      await expect(getEditors(page)).toHaveCount(2);
      await expect(getEditors(page).nth(1)).toHaveText("Nested child");
    },
  ),
  defineScenario(
    "7. Toggle Block",
    "Toggle children as full blocks",
    "the slash menu works inside a toggle child",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      await createBlockViaSlash(page, "toggle", "Toggle");
      const summary = getEditors(page).first();
      await clearAndType(summary, "Summary");
      await pressEnter(summary);
      const child = getEditors(page).nth(1);
      await child.waitFor();
      await openSlashMenuFromEditor(child, "/");
      await expect(slashMenu(page)).toContainText("Heading");
    },
  ),
  defineScenario(
    "7. Toggle Block",
    "Toggle children as full blocks",
    "markdown shortcuts still work inside a toggle child",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      await createBlockViaSlash(page, "toggle", "Toggle");
      const summary = getEditors(page).first();
      await clearAndType(summary, "Summary");
      await pressEnter(summary);
      const child = getEditors(page).nth(1);
      await clearAndType(child, "- ");
      await page.keyboard.type("Nested bullet");
      await expect(page.locator('.inline-block[class~="w-1.5"][class~="h-1.5"]')).toHaveCount(1);
    },
  ),
  defineScenario(
    "7. Toggle Block",
    "Toggle children as full blocks",
    "Tab indents one toggle child under another inside the toggle tree",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      await createBlockViaSlash(page, "toggle", "Toggle");
      const summary = getEditors(page).first();
      await clearAndType(summary, "Summary");
      await pressEnter(summary);
      const firstChild = getEditors(page).nth(1);
      await clearAndType(firstChild, "A");
      await pressEnter(firstChild);
      const secondChild = getEditors(page).nth(2);
      await clearAndType(secondChild, "B");
      const before = await editorLeft(secondChild);
      await pressTab(secondChild);
      expect(await editorLeft(secondChild)).toBeGreaterThan(before + 8);
    },
  ),
  defineScenario(
    "7. Toggle Block",
    "Toggle + external interactions",
    "a root block can be moved into a collapsed toggle and remains hidden until the toggle is expanded",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      await createBlockViaSlash(page, "toggle", "Toggle");
      await page.keyboard.type("Toggle summary");
      const summary = getEditors(page).first();
      await openBlockContextMenuForEditor(summary);
      await contextMenuItem(page, "Insert text below").click();
      const child = getEditors(page).nth(1);
      await clearAndType(child, "Hidden child");
      await toggleChevron(page).click();
      await pressTab(child);
      await expect(getEditors(page)).toHaveCount(1);
      await toggleChevron(page).click();
      await expect(getEditors(page)).toHaveCount(2);
      await expect(getEditors(page).nth(1)).toHaveText("Hidden child");
    },
  ),
  defineScenario(
    "7. Toggle Block",
    "Toggle + external interactions",
    "deleting an empty toggle summary promotes its child blocks to the parent level",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      await createBlockViaSlash(page, "toggle", "Toggle");
      const summary = getEditors(page).first();
      await clearAndType(summary, "Summary");
      await pressEnter(summary);
      const child = getEditors(page).nth(1);
      await clearAndType(child, "Promoted child");
      const childLeft = await editorLeft(child);
      await clearAndType(summary, "");
      await summary.press("Backspace");
      await expect(getEditors(page)).toHaveCount(1);
      await expect(getEditors(page).first()).toHaveText("Promoted child");
      expect(await editorLeft(getEditors(page).first())).toBeLessThan(
        childLeft - 8,
      );
    },
  ),
  defineScenario(
    "8. Callout & Quote as Containers",
    "Callout",
    "callout children are rendered inside the callout box",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      await createBlockViaSlash(page, "callout", "Callout");
      const callout = getEditors(page).first();
      await clearAndType(callout, "Callout");
      await pressEnter(callout);
      const child = getEditors(page).nth(1);
      await clearAndType(child, "Nested inside callout");
      await expect(
        blockLocatorForEditor(callout).locator("[data-block-id]"),
      ).toContainText(["Nested inside callout"]);
    },
  ),
  defineScenario(
    "8. Callout & Quote as Containers",
    "Callout",
    "indenting a paragraph under a callout renders it as a child inside the container",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      await createBlockViaSlash(page, "callout", "Callout");
      const callout = getEditors(page).first();
      await clearAndType(callout, "Callout");
      await pressEnter(callout);
      const child = getEditors(page).nth(1);
      expect(await editorLeft(child)).toBeGreaterThan(
        (await editorLeft(callout)) + 8,
      );
    },
  ),
  defineScenario(
    "8. Callout & Quote as Containers",
    "Callout",
    "slash menu commands work inside callout children",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      await createBlockViaSlash(page, "callout", "Callout");
      const callout = getEditors(page).first();
      await clearAndType(callout, "Callout");
      await pressEnter(callout);
      const child = getEditors(page).nth(1);
      await child.waitFor();
      await openSlashMenuFromEditor(child, "/");
      await expect(slashMenu(page)).toContainText("Heading");
    },
  ),
  defineScenario(
    "8. Callout & Quote as Containers",
    "Callout",
    "deleting an empty callout keeps nested grandchildren under their promoted parent",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      await createBlockViaSlash(page, "callout", "Callout");
      const callout = getEditors(page).first();
      await clearAndType(callout, "Callout");
      await pressEnter(callout);
      const parentChild = getEditors(page).nth(1);
      await clearAndType(parentChild, "Parent child");
      await pressEnter(parentChild);
      const secondChild = getEditors(page).nth(2);
      await clearAndType(secondChild, "Grandchild");
      await pressTab(secondChild);
      const parentChildLeftBefore = await editorLeft(parentChild);
      const nestedLeftBefore = await editorLeft(secondChild);
      await clearAndType(callout, "");
      await callout.press("Backspace");
      const promotedParent = getEditors(page).first();
      const promotedGrandchild = getEditors(page).nth(1);
      await expect(promotedParent).toHaveText("Parent child");
      await expect(promotedGrandchild).toHaveText("Grandchild");
      const nestedOffsetBefore = nestedLeftBefore - parentChildLeftBefore;
      const promotedParentLeft = await editorLeft(promotedParent);
      const promotedGrandchildLeft = await editorLeft(promotedGrandchild);
      expect(promotedGrandchildLeft).toBeGreaterThan(promotedParentLeft + 8);
      expect(promotedGrandchildLeft - promotedParentLeft).toBeGreaterThan(
        nestedOffsetBefore - 4,
      );
    },
  ),
  defineScenario(
    "8. Callout & Quote as Containers",
    "Callout",
    "deleting an empty callout promotes its children instead of deleting their content",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      await createBlockViaSlash(page, "callout", "Callout");
      const callout = getEditors(page).first();
      await clearAndType(callout, "Callout");
      await pressEnter(callout);
      const child = getEditors(page).nth(1);
      await clearAndType(child, "Promoted child");
      const childLeft = await editorLeft(child);
      await clearAndType(callout, "");
      await callout.press("Backspace");
      await expect(getEditors(page)).toHaveCount(1);
      await expect(getEditors(page).first()).toHaveText("Promoted child");
      expect(await editorLeft(getEditors(page).first())).toBeLessThan(
        childLeft - 8,
      );
    },
  ),
  defineScenario(
    "8. Callout & Quote as Containers",
    "Quote",
    "quote children are rendered inside the quote branch",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      await createBlockViaSlash(page, "quote", "Quote");
      const quote = getEditors(page).first();
      await clearAndType(quote, "Quote");
      await pressEnter(quote);
      const child = getEditors(page).nth(1);
      await clearAndType(child, "Nested inside quote");
      await expect(
        blockLocatorForEditor(quote).locator("[data-block-id]"),
      ).toContainText(["Nested inside quote"]);
    },
  ),
  defineScenario(
    "8. Callout & Quote as Containers",
    "Quote",
    "a quote can contain multiple child blocks rendered inside the quote branch",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      await createBlockViaSlash(page, "quote", "Quote");
      const quote = getEditors(page).first();
      await clearAndType(quote, "Quote");
      await pressEnter(quote);
      const firstChild = getEditors(page).nth(1);
      await clearAndType(firstChild, "Child 1");
      await pressEnter(firstChild);
      const secondChild = getEditors(page).nth(2);
      await clearAndType(secondChild, "Child 2");
      const quoteLeft = await editorLeft(quote);
      expect(await editorLeft(firstChild)).toBeGreaterThan(quoteLeft + 8);
      expect(await editorLeft(secondChild)).toBeGreaterThan(quoteLeft + 8);
      await expect(getEditors(page)).toHaveCount(3);
    },
  ),
  defineScenario(
    "8. Callout & Quote as Containers",
    "Quote",
    "deleting an empty quote promotes its children according to editor rules",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      await createBlockViaSlash(page, "quote", "Quote");
      const quote = getEditors(page).first();
      await clearAndType(quote, "Quote");
      await pressEnter(quote);
      const child = getEditors(page).nth(1);
      await clearAndType(child, "Promoted quote child");
      const childLeft = await editorLeft(child);
      await clearAndType(quote, "");
      await quote.press("Backspace");
      await expect(getEditors(page)).toHaveCount(1);
      await expect(getEditors(page).first()).toHaveText("Promoted quote child");
      expect(await editorLeft(getEditors(page).first())).toBeLessThan(
        childLeft - 8,
      );
    },
  ),
  defineScenario(
    "10. Paste Handling",
    "Paste handling",
    "pasting the auth environment markdown opening creates separate blocks",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      const editor = await activateFirstEditor(page);
      await pasteText(editor, AUTH_ENVIRONMENT_OPENING_MARKDOWN);

      await expect(page.locator("[data-block-id]")).toHaveCount(9);
      expect(await getRenderedBlockTypes(page)).toEqual([
        "heading_1",
        "paragraph",
        "paragraph",
        "heading_2",
        "paragraph",
        "code",
        "paragraph",
        "code",
        "heading_2",
      ]);
      await expect(getEditors(page).nth(0)).toHaveText("Authentication environment and production transition");
      await expect(getEditors(page).nth(1)).toHaveText("Last updated: 2026-05-10");
      await expect(getEditors(page).nth(3)).toHaveText("Development variables");
      await expect(getCodeTextareas(page).nth(0)).toHaveValue(/PUBLIC_AUTH_GATEWAY_URL=\/api\/auth/);
      await expect(getCodeTextareas(page).nth(1)).toHaveValue(/docker run --rm/);
    },
    { serial: true },
  ),
  defineScenario(
    "10. Paste Handling",
    "Paste handling",
    "pasting the full auth environment markdown keeps code and lists scoped",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      const editor = await activateFirstEditor(page);
      await pasteText(editor, AUTH_ENVIRONMENT_FULL_MARKDOWN);

      const blockTypes = await getRenderedBlockTypes(page);
      await expect(page.locator("[data-block-id]")).toHaveCount(51);
      expect(blockTypes.filter((type) => type === "code")).toHaveLength(5);
      expect(blockTypes.filter((type) => type === "numbered_list")).toHaveLength(7);
      expect(blockTypes.filter((type) => type === "bulleted_list")).toHaveLength(14);

      await expect(getCodeTextareas(page).nth(0)).toHaveValue(/PUBLIC_AUTH_GATEWAY_URL=\/api\/auth[\s\S]*PUBLIC_SITE_URL=http:\/\/localhost:4322/);
      await expect(getCodeTextareas(page).nth(0)).not.toHaveValue(/Local runtime/);
      await expect(getCodeTextareas(page).nth(2)).toHaveValue([
        "PUBLIC_SITE_URL=http://localhost:4322",
        "ASTRO_DEV_PORT=4322",
        "PUBLIC_AUTH_GATEWAY_URL=/api/auth",
      ].join("\n"));

      await expect(page.locator('[data-block-type="numbered_list"] [role="textbox"]').first()).toHaveText(
        "Create a Cloudflare Turnstile widget for the production hostname.",
      );
      await expect(page.locator('[data-block-type="bulleted_list"] [role="textbox"]').first()).toHaveText(
        "verifies Cloudflare Turnstile server-side before registration, login, and recovery",
      );
      await expect(page.getByText("Local runtime", { exact: true })).toBeVisible();
      await expect(page.getByText("Production variables", { exact: true })).toBeVisible();
    },
    { serial: true },
  ),
  defineScenario(
    "10. Paste Handling",
    "Paste handling",
    "pasting multiline markdown creates multiple corresponding blocks",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      const editor = await activateFirstEditor(page);
      await pasteText(editor, "# Title\n\nParagraph\n\n- Item");
      await expect(getEditors(page)).toHaveCount(3);
      await expect(getEditors(page).first()).toHaveText("Title");
      await expect(page.locator('.inline-block[class~="w-1.5"][class~="h-1.5"]')).toHaveCount(1);
    },
    { serial: true },
  ),
  defineScenario(
    "10. Paste Handling",
    "Paste handling",
    "pasting a fenced code block creates a code block with the pasted content",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      const editor = await activateFirstEditor(page);
      await pasteText(editor, "```js\nconsole.log(1)\n```");
      await expect(getCodeTextarea(page)).toBeVisible();
      await expect(getCodeTextarea(page)).toHaveValue("console.log(1)");
    },
    { serial: true },
  ),
  defineScenario(
    "10. Paste Handling",
    "Paste handling",
    "pasting heading levels 4-6 preserves each heading level style",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      const editor = await activateFirstEditor(page);
      await pasteText(
        editor,
        "#### Heading 4\n##### Heading 5\n###### Heading 6",
      );

      const editors = getEditors(page);
      await expect(editors).toHaveCount(3);
      await expect(editors.nth(0)).toHaveText("Heading 4");
      await expect(editors.nth(1)).toHaveText("Heading 5");
      await expect(editors.nth(2)).toHaveText("Heading 6");

      await expect(editors.nth(0)).toHaveClass(/text-base/);
      await expect(editors.nth(1)).toHaveClass(/text-sm/);
      await expect(editors.nth(2)).toHaveClass(/text-xs/);
    },
    { serial: true },
  ),
  defineScenario(
    "10. Paste Handling",
    "Paste handling",
    "pasting block markdown inside text splits the current block around the caret",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      const editor = await activateFirstEditor(page);
      await clearAndType(editor, "HelloWorld");
      await setCaretInsideText(editor, "HelloWorld", "Hello".length);

      await pasteTextAtCurrentCaret(page, "## Inserted heading\n\nInserted paragraph");

      await expect(page.locator("[data-block-id]")).toHaveCount(4);
      expect(await getRenderedBlockTypes(page)).toEqual([
        "paragraph",
        "heading_2",
        "paragraph",
        "paragraph",
      ]);
      await expect(getEditors(page).nth(0)).toHaveText("Hello");
      await expect(getEditors(page).nth(1)).toHaveText("Inserted heading");
      await expect(getEditors(page).nth(2)).toHaveText("Inserted paragraph");
      await expect(getEditors(page).nth(3)).toHaveText("World");
    },
    { serial: true },
  ),
  defineScenario(
    "10. Paste Handling",
    "Paste handling",
    "pasting a single short line keeps it as inline text in the current block",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      const editor = await activateFirstEditor(page);
      await pasteText(editor, "Single line paste");
      await expect(getEditors(page)).toHaveCount(1);
      await expect(editor).toHaveText("Single line paste");
    },
    { serial: true },
  ),
];
