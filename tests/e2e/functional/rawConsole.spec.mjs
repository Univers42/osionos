/* ************************************************************************** */
/*                                                                            */
/*   rawConsole.spec.mjs                                                      */
/*                                                                            */
/*   Raw mode's Advanced toggle swaps the textarea for the code editor,       */
/*   which marks the attributes the save drops and clears the mark once      */
/*   fixed; the text carries across both panes and the save keeps the       */
/*   fix. Never toggled, the editor's code is never fetched (ADR 0064        */
/*   PS22, PS23).                                                            */
/*                                                                            */
/* ************************************************************************** */

// Caveat: "never fetched" is a request-URL match on /monaco/i; a chunk that bundled the editor
// under an unrelated name would slip past it. The production build is checked separately by
// scratch/integ/console/static-imports.py on the built entry.

import { expect, test } from "@playwright/test";

import { openPageMenuPanel } from "../../browser/core/app.mjs";
import { seedPage } from "../support/embedSeed.mjs";

const PAGE = [{ id: "intro", type: "paragraph", content: "Intro" }];
const BAD = "Intro\n\n::: grid {cols=9}\nCard\n:::";
const MONACO_TIMEOUT = 120_000;

const rawView = (page) => page.locator("[data-raw-mode]").filter({ visible: true });
const textarea = (page) => rawView(page).locator('textarea[name="raw-markdown-source"]');
const advanced = (page) => rawView(page).getByRole("button", { name: "Advanced", exact: true });
const consoleEditor = (page) => rawView(page).locator(".monaco-editor");
const problems = (page) => rawView(page).getByTestId("raw-console-problems");

function watchMonacoRequests(page) {
  const urls = [];
  page.on("request", (request) => {
    if (/monaco/i.test(request.url())) urls.push(request.url());
  });
  return urls;
}

async function openRaw(page, baseURL) {
  await seedPage(page, baseURL, PAGE);
  await (await openPageMenuPanel(page, "more")).getByRole("button", { name: "Raw / code mode" }).click();
  await expect(textarea(page)).toBeVisible();
}

/** Replaces the editor's whole text as one input event, so no bracket is auto-closed. */
async function replaceConsoleText(page, text) {
  await consoleEditor(page).locator(".view-lines").click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.insertText(text);
}

/** Hovers the `index`-th character of the first line: the font is monospace, so one glyph is the line's width over its length. */
async function hoverCharacter(page, index) {
  const text = consoleEditor(page).locator(".view-line > span").first();
  const box = await text.boundingBox();
  const glyph = box.width / (await text.textContent()).length;
  await page.mouse.move(box.x + glyph * (index + 0.5), box.y + box.height / 2);
}

async function savedGrid(page) {
  return page.evaluate(async () => {
    const store = (await import("/src/store/usePageStore.ts")).usePageStore.getState();
    return store.pageById(store.activePage?.id)?.content?.find((block) => block.type === "column_list")?.style ?? null;
  });
}

test("Advanced marks a dropped attribute, clears it once fixed, and the save keeps the fix", async ({ page, baseURL }) => {
  test.setTimeout(240_000);
  const monaco = watchMonacoRequests(page);
  await openRaw(page, baseURL);
  await expect(advanced(page)).toHaveAttribute("aria-pressed", "false");
  await advanced(page).focus();
  await page.keyboard.press("Enter");
  await expect(advanced(page)).toHaveAttribute("aria-pressed", "true");
  await expect(consoleEditor(page)).toBeVisible({ timeout: MONACO_TIMEOUT });
  await expect(textarea(page)).toHaveCount(0);
  expect(monaco.length).toBeGreaterThan(0);
  expect(await page.evaluate(() => localStorage.getItem("osio.raw.advanced"))).toBe("1");

  await replaceConsoleText(page, BAD);
  await expect(problems(page)).toContainText("1 attribute");
  await expect(rawView(page).locator(".squiggly-warning")).toHaveCount(1);
  await replaceConsoleText(page, BAD.replace("cols=9", "cols=3"));
  await expect(problems(page)).toContainText("No attribute");
  await expect(rawView(page).locator(".squiggly-warning")).toHaveCount(0);
  await expect(rawView(page).getByText("Card").last()).toBeVisible();

  await advanced(page).click();
  await expect(consoleEditor(page)).toHaveCount(0);
  await expect(textarea(page)).toHaveValue(/::: grid \{cols=3\}/);
  expect(await page.evaluate(() => localStorage.getItem("osio.raw.advanced"))).toBe("0");
  await rawView(page).getByRole("button", { name: "Save" }).click();
  await expect.poll(() => savedGrid(page)).toMatchObject({ layout: "grid", cols: 3 });
});

test("the code pane reopens on the text being edited, not the text raw mode opened with", async ({ page, baseURL }) => {
  await openRaw(page, baseURL);
  await textarea(page).fill("Edited before switching");
  await rawView(page).getByRole("button", { name: "Preview", exact: true }).click();
  await expect(textarea(page)).toHaveCount(0);
  await rawView(page).getByRole("button", { name: "Code", exact: true }).click();
  await expect(textarea(page)).toHaveValue("Edited before switching");
});

test("with Advanced never toggled, no code-editor chunk is requested", async ({ page, baseURL }) => {
  const monaco = watchMonacoRequests(page);
  await openRaw(page, baseURL);
  await textarea(page).fill("Intro\n\n::: grid {cols=9}\nCard\n:::");
  await expect(rawView(page).getByText("Card").last()).toBeVisible();
  await expect(advanced(page)).toHaveAttribute("aria-pressed", "false");
  expect(monaco).toEqual([]);
});

/** Before any page script: the flag is read once, when the app loads. */
async function setLayoutModes(page, isOn) {
  await page.addInitScript((on) => {
    if (on) localStorage.setItem("osio.layout.modes", "1");
    else localStorage.removeItem("osio.layout.modes");
  }, isOn);
}

test("Advanced completes kinds and scale values and explains a key on hover", async ({ page, baseURL }) => {
  test.setTimeout(240_000);
  await setLayoutModes(page, true);
  await openRaw(page, baseURL);
  await advanced(page).click();
  await expect(consoleEditor(page)).toBeVisible({ timeout: MONACO_TIMEOUT });
  // fixedOverflowWidgets mounts the suggest and hover widgets on the body, outside the raw view.
  const suggestions = page.locator(".suggest-widget .monaco-list-row").filter({ visible: true });

  await replaceConsoleText(page, "::: gr");
  await page.keyboard.press("Control+Space");
  await expect(suggestions.filter({ hasText: "grid" })).toHaveCount(1);
  await page.keyboard.press("Escape");

  await replaceConsoleText(page, "::: grid {cols=");
  await page.keyboard.press("Control+Space");
  await expect(suggestions.filter({ hasText: /^6/ })).toHaveCount(1);
  await page.keyboard.press("Tab");
  await expect(consoleEditor(page).locator(".view-lines")).toContainText("::: grid {cols=1");

  await hoverCharacter(page, "::: grid {cols=1".indexOf("cols") + 1);
  await expect(page.locator(".monaco-hover").filter({ visible: true })).toContainText("Tracks of a grid");
});

test("with osio.layout.modes off, Advanced offers no section, layout kind or key", async ({ page, baseURL }) => {
  test.setTimeout(240_000);
  await setLayoutModes(page, false);
  await openRaw(page, baseURL);
  await advanced(page).click();
  await expect(consoleEditor(page)).toBeVisible({ timeout: MONACO_TIMEOUT });
  const suggestions = page.locator(".suggest-widget .monaco-list-row").filter({ visible: true });

  await replaceConsoleText(page, "::: ");
  await page.keyboard.press("Control+Space");
  // The label alone: a row's text also holds its detail, and column's mentions a grid.
  await expect(suggestions.locator(".label-name")).toHaveText(["columns", "column"]);
  await page.keyboard.press("Escape");

  await replaceConsoleText(page, "::: grid {cols=");
  await page.keyboard.press("Control+Space");
  await expect(suggestions.filter({ hasText: /^\d/ })).toHaveCount(0);
});

/** Main-frame document requests: a reload is one more entry. */
function recordDocuments(page) {
  const documents = [];
  page.on("request", (request) => {
    if (request.isNavigationRequest() && request.frame() === page.mainFrame()) documents.push(request.url());
  });
  return documents;
}

test("text typed before a failed console chunk reloads the page is there after the reload", async ({ page, baseURL }) => {
  test.setTimeout(240_000);
  await page.route(/RawMonacoPane/, (route) => route.abort());
  const documents = recordDocuments(page);
  await openRaw(page, baseURL);
  const loaded = documents.length;
  await textarea(page).fill("Typed before the reload");
  await advanced(page).click();
  // The dev server has no preload helper, so the failed import only rejects: fire the event the
  // production helper fires for it. The handler and its reload are the app's own (ADR 0061).
  await expect(rawView(page).getByText("did not load")).toBeVisible();
  await page.evaluate(() => globalThis.dispatchEvent(new Event("vite:preloadError")));
  await expect.poll(() => documents.length).toBe(loaded + 1);
  await expect(textarea(page)).toHaveValue("Typed before the reload");
  await expect(rawView(page).getByText("●")).toBeVisible();
});

/** The console's markers anywhere in Monaco's marker service, attached model or not. */
async function consoleMarkerCount(page) {
  return page.evaluate(async () => {
    const { editor } = await import("/src/features/ide/model/monacoRuntime.ts");
    return editor.getModelMarkers({ owner: "osionos-raw" }).length;
  });
}

test("closing the console clears its markers with its model", async ({ page, baseURL }) => {
  test.setTimeout(240_000);
  await openRaw(page, baseURL);
  await advanced(page).click();
  await expect(consoleEditor(page)).toBeVisible({ timeout: MONACO_TIMEOUT });
  await replaceConsoleText(page, BAD);
  await expect(problems(page)).toContainText("1 attribute");
  expect(await consoleMarkerCount(page)).toBe(1);

  await advanced(page).click();
  await expect(consoleEditor(page)).toHaveCount(0);
  expect(await consoleMarkerCount(page)).toBe(0);
});

test("Enter with a suggestion open starts a new line; it never accepts", async ({ page, baseURL }) => {
  test.setTimeout(240_000);
  await setLayoutModes(page, true);
  await openRaw(page, baseURL);
  await advanced(page).click();
  await expect(consoleEditor(page)).toBeVisible({ timeout: MONACO_TIMEOUT });
  const suggestions = page.locator(".suggest-widget .monaco-list-row").filter({ visible: true });

  await replaceConsoleText(page, "::: gr");
  await page.keyboard.press("Control+Space");
  await expect(suggestions.filter({ hasText: "grid" })).toHaveCount(1);
  await page.keyboard.press("Enter");
  await expect(consoleEditor(page).locator(".view-line")).toHaveCount(2);
  await expect(consoleEditor(page).locator(".view-lines")).not.toContainText("grid");
});
