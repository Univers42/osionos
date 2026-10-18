// A stored `draw` block must never lose its scene: it survives a reload, an unrelated edit and
// the cache save that follows byte for byte, is removed only by an explicit Delete, and is never
// offered as editable text. Whether it arrived in the page cache or as a pasted `osidraw` fence.
// The scene is pretty-printed and non-ASCII on purpose: any JSON.parse/stringify round trip on
// the way through the store would rewrite its bytes.

import { expect, test } from "@playwright/test";

import {
  activateFirstEditor,
  clearAndTypePageTitle,
  explorerRow,
  focusEditorEnd,
  getEditors,
  openFreshPage,
  pageTitleEditor,
  pasteText,
} from "../../browser/core/app.mjs";

const DRAW_HEIGHT = 437;
const SCENE = JSON.stringify(
  {
    type: "osidraw",
    version: 1,
    elements: [
      { id: "a", type: "rectangle", x: 10.5, y: -3 },
      { id: "b", type: "text", text: "café ✓ — 図" },
    ],
  },
  null,
  2,
);
// A line of the scene no ordinary page text contains; found in an editable surface, the scene leaked.
const SCENE_PROBE = '"type": "osidraw"';

const drawBlock = (page) => page.locator('article[data-block-type="draw"]');
const notice = (page) => drawBlock(page).getByRole("group", { name: "Retired drawing" });

/** The stored `draw` blocks of the page titled `title`, read from every `osio:pages:*` cache. */
async function storedDrawBlocks(page, title) {
  return page.evaluate((pageTitle) => {
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (!key?.startsWith("osio:pages:")) continue;
      const pages = JSON.parse(localStorage.getItem(key) ?? "[]");
      if (!Array.isArray(pages)) continue;
      const entry = pages.find((candidate) => candidate.title === pageTitle);
      if (entry) {
        return (entry.content ?? [])
          .filter((block) => block.type === "draw")
          .map(({ id, content, drawHeight }) => ({ id, content, drawHeight }));
      }
    }
    return null;
  }, title);
}

async function reloadAndOpen(page, title) {
  await page.reload({ waitUntil: "domcontentloaded" });
  const titleEditor = pageTitleEditor(page);
  await titleEditor.waitFor({ timeout: 10_000 }).catch(() => undefined);
  if (!((await titleEditor.textContent().catch(() => "")) ?? "").includes(title)) {
    await explorerRow(page, title).click();
  }
  await expect(pageTitleEditor(page)).toContainText(title);
}

/** Writes the draw block into the cache entry of a page the app itself created, so the page and
 *  workspace ids are the app's own; the reload then loads it the way a stored page loads. */
async function seedCachedDrawPage(page, baseURL, title) {
  await openFreshPage(page, baseURL);
  await clearAndTypePageTitle(page, title);
  await expect.poll(() => storedDrawBlocks(page, title)).toEqual([]);
  await page.evaluate(
    ({ pageTitle, scene, drawHeight }) => {
      for (let index = 0; index < localStorage.length; index += 1) {
        const key = localStorage.key(index);
        if (!key?.startsWith("osio:pages:")) continue;
        const pages = JSON.parse(localStorage.getItem(key) ?? "[]");
        const entry = Array.isArray(pages) ? pages.find((candidate) => candidate.title === pageTitle) : undefined;
        if (!entry) continue;
        entry.content = [
          { id: "legacy-draw-block", type: "draw", content: scene, drawHeight },
          { id: "legacy-draw-notes", type: "paragraph", content: "Notes" },
        ];
        localStorage.setItem(key, JSON.stringify(pages));
      }
    },
    { pageTitle: title, scene: SCENE, drawHeight: DRAW_HEIGHT },
  );
  await reloadAndOpen(page, title);
}

async function pasteFencedDrawPage(page, baseURL, title) {
  await openFreshPage(page, baseURL);
  await clearAndTypePageTitle(page, title);
  const editor = await activateFirstEditor(page);
  await pasteText(editor, `\`\`\`osidraw h=${DRAW_HEIGHT}\n${SCENE}\n\`\`\`\n\nNotes`);
  await expect(notice(page)).toBeVisible();
  await expect.poll(() => storedDrawBlocks(page, title)).toEqual([
    { id: expect.any(String), content: SCENE, drawHeight: DRAW_HEIGHT },
  ]);
}

const SOURCES = [
  { name: "a cached draw block", title: "Legacy drawing cached", open: seedCachedDrawPage },
  { name: "a pasted osidraw fence", title: "Legacy drawing fenced", open: pasteFencedDrawPage },
];

test.describe("legacy draw block keeps its data", () => {
  for (const source of SOURCES) {
    test(`${source.name} survives reload, an unrelated edit and its save byte for byte`, async ({ page, baseURL }) => {
      await source.open(page, baseURL, source.title);
      await expect(notice(page)).toBeVisible();
      await expect(notice(page)).toContainText("This drawing was made with the retired Draw tool.");
      const [before] = await storedDrawBlocks(page, source.title);
      expect(before).toMatchObject({ content: SCENE, drawHeight: DRAW_HEIGHT });

      await reloadAndOpen(page, source.title);
      await expect(notice(page)).toBeVisible();

      const token = `edit-${Date.now().toString(36)}`;
      const notes = getEditors(page).filter({ hasText: "Notes" });
      await focusEditorEnd(notes);
      await page.keyboard.type(` ${token}`);
      await expect
        .poll(async () => JSON.stringify(await page.evaluate(() => Object.entries(localStorage))))
        .toContain(token);

      await reloadAndOpen(page, source.title);
      await expect(getEditors(page).filter({ hasText: token })).toHaveCount(1);
      await expect(notice(page)).toBeVisible();
      expect(await storedDrawBlocks(page, source.title)).toEqual([before]);
    });

    test(`${source.name} is removed by the block menu's Delete`, async ({ page, baseURL }) => {
      await source.open(page, baseURL, source.title);
      await expect(notice(page)).toBeVisible();
      await drawBlock(page).hover();
      await drawBlock(page).locator('> [data-testid="block-drag-handle"]').click();
      // The row's accessible name carries its shortcut: "Delete Del".
      await page.getByTestId("block-context-menu").getByRole("menuitem", { name: /^Delete\b/ }).click();

      await expect(drawBlock(page)).toHaveCount(0);
      await expect.poll(() => storedDrawBlocks(page, source.title)).toEqual([]);
      await reloadAndOpen(page, source.title);
      await expect(drawBlock(page)).toHaveCount(0);
      await expect(getEditors(page).filter({ hasText: "Notes" })).toHaveCount(1);
    });

    test(`${source.name} never shows its scene JSON as editable text`, async ({ page, baseURL }) => {
      await source.open(page, baseURL, source.title);
      await expect(notice(page)).toBeVisible();
      await expect(drawBlock(page).locator('[contenteditable="true"], textarea, input')).toHaveCount(0);
      await expect(drawBlock(page)).not.toContainText(SCENE_PROBE);
      const editableValues = await page.evaluate(() =>
        [...document.querySelectorAll('[contenteditable="true"], textarea, input')].map((node) =>
          "value" in node ? String(node.value) : (node.textContent ?? ""),
        ),
      );
      expect(editableValues.filter((value) => value.includes(SCENE_PROBE))).toEqual([]);
    });
  }
});
