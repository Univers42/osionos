/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   cspSurfaces.mjs                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/* global document, localStorage, window */

// The surfaces D314-12 names, one entry each: `run` loads the surface's lazy chunk, worker or
// WebAssembly and returns only once something that proves it was reached is visible. A surface that
// cannot be reached throws, which is a FAILURE of the sweep, never a pass. `worker: true` marks a
// surface whose violation would be raised in a worker (the sweep SKIPs it where the worker control
// was not counted). `skip(viewport)` returns a reason, or nothing.

import { expect } from "@playwright/test";

import { activateFirstEditor, explorerRow, slashCommandEntry } from "../../browser/core/app.mjs";
import { bootApp } from "../perf/perfHarness.mjs";
import { addPropertyOfType } from "./databaseHelpers.mjs";
import { seedSession } from "./bridgeSession.mjs";
import { BOARD_PAGE, directMessageAnswer, whiteboardAnswer } from "./cspBridges.mjs";
import { seedLocalPages, stubWorld } from "./cspSweep.mjs";
import { openProfileFromPalette } from "./profilePageMocks.mjs";

const TINY_PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

const PAGES = [
  { _id: "csp-editor", title: "Sweep editor", content: [{ id: "p1", type: "paragraph", content: "first line" }] },
  {
    _id: "csp-rich", title: "Sweep rich",
    content: [
      { id: "m1", type: "code", content: "graph TD; A-->B;", language: "mermaid" },
      { id: "i1", type: "image", content: "", asset: TINY_PNG },
      { id: "e1", type: "embed", content: "https://embed-sweep.test/app", embed: { url: "https://embed-sweep.test/app", kind: "link", provider: null, title: "", description: "", siteName: "", image: "", favicon: "", player: null, media: null, frameable: true, resolvedAt: "2026-10-19T12:00:00.000Z" } },
    ],
  },
];

// The activity bar is in every layout (the explorer and Settings button are not on a phone).
const appIsUp = (page) => expect(page.getByRole("tablist", { name: "Activity bar" })).toBeVisible({ timeout: 30_000 });

/** The stub world, a local workspace and (with `signedIn`) a bridge session; the app is open. */
async function openApp(page, baseURL, { signedIn = false, respond } = {}) {
  await stubWorld(page, baseURL, respond);
  await seedLocalPages(page, PAGES);
  if (signedIn) await seedSession(page, {});
  await page.goto(baseURL, { waitUntil: "domcontentloaded" });
  await appIsUp(page);
}

// A click on the Explorer tab toggles it: only press it when the layout does not already show the tree.
async function revealRow(page, title) {
  const row = explorerRow(page, title);
  await row.waitFor({ timeout: 4_000 }).catch(() => page.getByRole("tab", { name: "Explorer", exact: true }).click());
  return row;
}

async function openPageNamed(page, baseURL, title) {
  await openApp(page, baseURL);
  await (await revealRow(page, title)).click();
}

async function openEditor(page, baseURL) {
  await openPageNamed(page, baseURL, "Sweep editor");
  const editor = await activateFirstEditor(page);
  await editor.click();
  return editor;
}

async function openDatabaseHome(page, baseURL) {
  await stubWorld(page, baseURL);
  await page.goto(new URL("/?home=database", baseURL).toString(), { waitUntil: "domcontentloaded" });
  await page.locator('[aria-label="Add view"]').first().waitFor({ timeout: 30_000 });
}

async function addChartOnTheme(page) {
  await page.locator('[aria-label="Add view"]').first().click();
  await page.getByRole("button", { name: "Chart", exact: true }).first().click();
  await page.getByRole("button", { name: "Chart", exact: true }).first().click();
  await page.getByText("Edit view", { exact: true }).click();
  await page.getByText("What to show").first().click();
  await page.getByRole("button", { name: /Theme/ }).first().click();
  await expect(page.locator(".recharts-bar-rectangle path").first()).toBeVisible({ timeout: 30_000 });
}

async function openCodeFile(page, baseURL, name, body) {
  await stubWorld(page, baseURL);
  await bootApp(page);
  await page.locator("[data-osio-workbench]").waitFor({ state: "visible", timeout: 60_000 });
  await page.evaluate(([file, text]) => globalThis.__perfOpenCodePage(file, text), [name, body]);
  await page.getByRole("textbox", { name: "Code editor" }).waitFor({ state: "attached", timeout: 90_000 });
}

export const SURFACES = [
  { name: "boot signed out", run: async ({ page, baseURL }) => openApp(page, baseURL, {}) },
  { name: "boot signed in", run: async ({ page, baseURL }) => openApp(page, baseURL, { signedIn: true }) },
  {
    name: "editor typing and slash menu",
    run: async ({ page, baseURL }) => {
      const editor = await openEditor(page, baseURL);
      await page.keyboard.press("End");
      await page.keyboard.type(" more text /head");
      await expect(page.getByTestId("slash-command-menu")).toBeVisible();
      await expect(slashCommandEntry(page, "Heading 1").first()).toBeVisible();
      await expect(editor).toContainText("more text");
    },
  },
  {
    name: "rich page: mermaid, image, embed",
    run: async ({ page, baseURL }) => {
      await openPageNamed(page, baseURL, "Sweep rich");
      await expect(page.locator("svg[aria-roledescription]").first()).toBeVisible({ timeout: 60_000 });
      await expect(page.locator('.osionos-page img[src^="data:image/png"]').first()).toBeVisible();
      // The frame is only mounted once its box is near the viewport.
      await page.locator('[data-block-type="embed"]').first().scrollIntoViewIfNeeded({ timeout: 30_000 });
      const frame = page.locator('[data-block-type="embed"] iframe').first();
      await expect(frame).toBeAttached({ timeout: 30_000 });
    },
  },
  {
    name: "code file: Monaco and markdown preview worker",
    worker: true,
    timeout: 240_000,
    run: async ({ page, baseURL }) => {
      await openCodeFile(page, baseURL, "README.md", "# App preview\n\nbody text\n");
      await page.locator(".monaco-editor .view-lines").first().click();
      await page.keyboard.press("Control+Shift+V");
      await expect(page.getByRole("region", { name: "Preview" }).getByRole("heading", { name: "App preview" })).toBeVisible({ timeout: 30_000 });
    },
  },
  {
    name: "theme JSON editor (json.worker)",
    worker: true,
    timeout: 240_000,
    run: async ({ page, baseURL }) => {
      await stubWorld(page, baseURL);
      await page.goto(new URL("/?settings=preferences", baseURL).toString(), { waitUntil: "domcontentloaded" });
      await page.getByRole("button", { name: "Advanced (JSON)" }).first().click();
      await page.locator(".monaco-editor textarea").first().waitFor({ state: "attached", timeout: 150_000 });
      await page.locator(".monaco-editor .view-lines").first().click();
      await page.keyboard.press("Control+A");
      await page.keyboard.insertText('{ "name": "T", "colors": { "bg-page": "#102030" } }');
      await page.keyboard.press("Shift+Control+End");
      await page.keyboard.press("Delete");
      await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--osio-bg-page").trim()), { timeout: 15_000 }).toBe("#102030");
    },
  },
  {
    name: "page export zip (jszip)",
    run: async ({ page, baseURL }) => {
      await openPageNamed(page, baseURL, "Sweep editor");
      // A child made through the UI: a seeded one is not seen by the exporter (it gave a lone .md).
      await (await revealRow(page, "Sweep editor")).click({ button: "right" });
      await page.getByRole("menuitem", { name: "Add child page", exact: true }).click();
      await page.getByRole("textbox", { name: "Page title" }).fill("Sweep child");
      await (await revealRow(page, "Sweep editor")).click({ button: "right" });
      await page.getByRole("menuitem", { name: "Export", exact: true }).click();
      await expect(page.getByTestId("export-dialog")).toBeVisible();
      const subpages = page.getByRole("switch", { name: "Include subpages" });
      if ((await subpages.getAttribute("aria-checked")) !== "true") await subpages.click();
      const [download] = await Promise.all([page.waitForEvent("download"), page.getByTestId("export-confirm").click()]);
      expect(download.suggestedFilename()).toMatch(/\.zip$/);
    },
  },
  {
    name: "database inline with a formula column (wasm)",
    run: async ({ page, baseURL }) => {
      const editor = await openEditor(page, baseURL);
      await page.keyboard.press("End");
      await page.keyboard.type(" /database");
      await slashCommandEntry(page, "Database - Inline").click();
      const block = page.locator(".osionos-database-block--inline:visible").first();
      await block.waitFor({ timeout: 30_000 });
      await block.hover();
      await block.getByRole("button", { name: "New", exact: true }).last().click();
      await addPropertyOfType(block, page, "Formula", "Calc");
      await block.locator('button[title="Click to edit formula"]').first().click();
      await page.getByPlaceholder("Your formula").fill('=UPPER("ok") & IF(2 >= 1, "!", "?")');
      // Attached, not visible: the phone layout truncates the preview, the computed text is still in it.
      await expect(page.getByText("OK!", { exact: true })).toBeAttached({ timeout: 15_000 });
      await expect(editor).toBeAttached();
    },
  },
  {
    name: "chart view and PNG export",
    run: async ({ page, baseURL }) => {
      await openDatabaseHome(page, baseURL);
      await addChartOnTheme(page);
      await page.getByText("Save chart as...").click();
      await page.getByRole("button", { name: /PNG image/ }).click();
      await expect(page.getByText(/^Saved .*\.png$/)).toBeVisible({ timeout: 30_000 });
    },
  },
  {
    name: "AI inline panel",
    run: async ({ page, baseURL }) => {
      await openEditor(page, baseURL);
      await page.keyboard.press("End");
      await page.keyboard.type(" /ask");
      await slashCommandEntry(page, "Ask AI").click();
      await expect(page.getByTestId("ai-inline-panel")).toBeVisible();
    },
  },
  {
    name: "whiteboard in-process",
    run: async ({ page, baseURL }) => {
      await page.addInitScript(() => localStorage.setItem("osio.whiteboard.inprocess", "1"));
      await openApp(page, baseURL, { signedIn: true, respond: whiteboardAnswer() });
      await (await revealRow(page, BOARD_PAGE.title)).click();
      await expect(page.getByTestId("whiteboard-inprocess").locator("canvas").first()).toBeVisible({ timeout: 30_000 });
    },
  },
  {
    name: "chat: direct message and attachment",
    run: async ({ page, baseURL }) => {
      await openApp(page, baseURL, { signedIn: true, respond: directMessageAnswer() });
      await openProfileFromPalette(page, "Bob");
      await page.getByRole("button", { name: "Message", exact: true }).click();
      const chooser = page.waitForEvent("filechooser");
      await page.getByRole("button", { name: "Attach file" }).click();
      await (await chooser).setFiles({ name: "shot.png", mimeType: "image/png", buffer: Buffer.from(TINY_PNG.split(",")[1], "base64") });
      await expect(page.getByRole("button", { name: "Remove attachment" })).toBeVisible({ timeout: 30_000 });
    },
  },
];
