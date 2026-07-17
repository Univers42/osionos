/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   app.mjs                                            :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/20 21:29:15 by rstancu           #+#    #+#             */
/*   Updated: 2026/05/11 23:43:50 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import process from "node:process";
import { expect } from "@playwright/test";

/** Create a new workspace page via whichever affordance the current UI offers
 *  (client-side — no reload, so in-memory app state survives). Waits for the
 *  primary "New page" button instead of an instant visibility probe — the
 *  sidebar can still be rendering when this runs. */
export async function createNewWorkspacePage(page) {
  const newPageButton = page.getByRole("button", { name: /New page/i }).first();
  const appeared = await newPageButton
    .waitFor({ state: "visible", timeout: 5_000 })
    .then(() => true)
    .catch(() => false);
  if (appeared) {
    await newPageButton.click();
  } else {
    const addPrivatePageButton = page
      .locator('button[title="Add to Private"], button[title="Add file"]')
      .first();
    await addPrivatePageButton.waitFor({ state: "attached" });
    await addPrivatePageButton.evaluate((node) => node.click());
  }
  await page.getByRole("textbox", { name: "Page title" }).waitFor();
}

export async function openFreshPage(page, appUrl) {
  await page.goto(appUrl, { waitUntil: "domcontentloaded" });
  await createNewWorkspacePage(page);
}

export async function openHarnessPage(page, appUrl, relativePath) {
  await page.goto(new URL(relativePath, appUrl).toString(), {
    waitUntil: "domcontentloaded",
  });
}

export async function activateFirstEditor(page) {
  const emptyState = page.getByRole("button", {
    name: /Click here to start writing/i,
  });

  if (await emptyState.count()) {
    await emptyState.click();
  }

  await getEditors(page).first().waitFor();
  return getEditors(page).first();
}

export function getEditors(page) {
  return page.locator('[role="textbox"][aria-multiline="true"]');
}

export function getCodeTextareas(page) {
  return page.locator('textarea[placeholder="Code…"]');
}

export function getCodeTextarea(page) {
  return getCodeTextareas(page).first();
}

export function pageTitleEditor(page) {
  return page.getByRole("textbox", { name: "Page title" });
}

export async function editorText(editor) {
  return (await editor.textContent()) ?? "";
}

export async function editorHtml(editor) {
  return editor.evaluate((node) => node.innerHTML);
}

export async function clearAndType(editor, text, options = {}) {
  const currentText = (await editor.textContent()) ?? "";
  await editor.click();
  if (currentText.trim().length > 0) {
    await editor.press(`${modifier()}+A`);
    if (!text) {
      await editor.press("Backspace");
      return;
    }
  }
  if (text) {
    // Optional per-key `delay` (ms): a markdown-shortcut trigger (e.g. "- ") that
    // converts the block needs a beat to commit to React state before the next
    // key lands — exactly like a human typing — or a fast-follow keystroke can
    // race the conversion's own DOM/content sync. Default stays instantaneous
    // for the many callers that aren't typing across a shortcut boundary.
    await editor.page().keyboard.type(text, options.delay ? { delay: options.delay } : undefined);
  }
}

export async function clearAndTypePageTitle(page, text) {
  const title = pageTitleEditor(page);
  await title.click();
  await title.press(`${modifier()}+A`);
  await page.keyboard.type(text);
}

export async function focusEditorStart(editor) {
  await editor.click();
  await editor.press("Home");
}

export async function focusEditorEnd(editor) {
  await editor.click();
  await editor.evaluate((node) => {
    const selection = globalThis.getSelection();
    const range = document.createRange();
    range.selectNodeContents(node);
    range.collapse(false);
    selection?.removeAllRanges();
    selection?.addRange(range);
  });
  const handle = await editor.elementHandle();
  if (!handle) {
    throw new Error("Could not resolve editor element for caret placement");
  }

  try {
    await editor.page().waitForFunction((node) => {
      const selection = globalThis.getSelection();
      return Boolean(
        selection &&
          selection.rangeCount > 0 &&
          selection.isCollapsed &&
          node.contains(selection.anchorNode),
      );
    }, handle);
  } finally {
    await handle.dispose();
  }
}

export async function pressEnter(editor) {
  await focusEditorEnd(editor);
  await editor.page().keyboard.press("Enter");
  await waitForRenderStability(editor.page());
}

export async function pressTab(target, options = {}) {
  await target.click();
  await target.page().keyboard.press(options.shift ? "Shift+Tab" : "Tab");
}

export async function focusTextareaEnd(textarea) {
  let lastState = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await waitForRenderStability(textarea.page());
    await textarea.focus();
    const state = await textarea.evaluate((node) => {
      node.focus();
      const end = node.value.length;
      node.setSelectionRange(end, end);
      return {
        active: document.activeElement === node,
        selectionStart: node.selectionStart,
        selectionEnd: node.selectionEnd,
        end,
      };
    });
    if (
      state.active &&
      state.selectionStart === state.end &&
      state.selectionEnd === state.end
    ) {
      return;
    }
    lastState = state;
  }
  if (lastState) {
    throw new Error(
      `Could not place textarea caret at end (active=${lastState.active}, start=${lastState.selectionStart}, end=${lastState.selectionEnd}, expected=${lastState.end})`,
    );
  }
}

export async function waitForRenderStability(page) {
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));
}

export async function selectText(editor, text, occurrence = 0) {
  const content = await editorText(editor);
  let startIndex = -1;
  let cursor = 0;

  for (let index = 0; index <= occurrence; index += 1) {
    startIndex = content.indexOf(text, cursor);
    if (startIndex === -1) {
      throw new Error(`Could not find "${text}" inside editable content`);
    }
    cursor = startIndex + text.length;
  }

  await editor.click();
  await editor.press("Home");

  for (let index = 0; index < startIndex; index += 1) {
    await editor.press("ArrowRight");
  }

  await editor.page().keyboard.down("Shift");
  for (const character of text) {
    if (character.length === 0) {
      continue;
    }
    await editor.press("ArrowRight");
  }
  await editor.page().keyboard.up("Shift");

  const handle = await editor.elementHandle();
  if (!handle) {
    throw new Error("Could not resolve editor element for text selection");
  }

  try {
    await editor.page().waitForFunction(
      ([node, expectedText]) => {
        const selection = globalThis.getSelection();
        return Boolean(
          selection &&
            selection.toString() === expectedText &&
            node.contains(selection.anchorNode),
        );
      },
      [handle, text],
    );
  } finally {
    await handle.dispose();
  }
}

export async function setCaretInsideText(editor, text, offsetFromStart) {
  const content = await editorText(editor);
  const startIndex = content.indexOf(text);
  if (startIndex === -1) {
    throw new Error(`Could not find "${text}" inside editable content`);
  }

  await editor.click();
  await editor.press("Home");

  for (let index = 0; index < startIndex + offsetFromStart; index += 1) {
    await editor.press("ArrowRight");
  }

  const handle = await editor.elementHandle();
  if (!handle) {
    throw new Error("Could not resolve editor element for caret placement");
  }

  try {
    await editor.page().waitForFunction((node) => {
      const selection = globalThis.getSelection();
      return Boolean(
        selection &&
          selection.rangeCount > 0 &&
          selection.isCollapsed &&
          node.contains(selection.anchorNode),
      );
    }, handle);
  } finally {
    await handle.dispose();
  }
}

export async function expectToolbar(page) {
  await page.getByTestId("inline-selection-toolbar").waitFor();
}

export function toolbarButton(page, title) {
  return page.getByTestId("inline-selection-toolbar").locator(`button[title="${title}"]`);
}

export function slashMenu(page) {
  return page.getByTestId("slash-command-menu");
}

export function slashCommandEntry(page, label) {
  return slashMenu(page).locator(
    `[data-testid="slash-command-entry"][data-command-label="${label}"]`,
  );
}

export function inlineColorPalette(page, kind) {
  return page.getByTestId(
    kind === "text" ? "inline-text-color-palette" : "inline-background-color-palette",
  );
}

export function mediaBlockPicker(page) {
  // The media picker is now the MediaEmbedDialog modal (role="dialog") — there is
  // no "media-block-picker" testid anymore (see MediaEmbedDialog.tsx / Modal.tsx).
  return page.getByRole("dialog");
}

export function pageCoverImage(page) {
  return page.getByTestId("page-cover-image");
}

export async function openColorPalette(page, kind) {
  await toolbarButton(
    page,
    kind === "text" ? "Text color" : "Background color",
  ).click();
  await inlineColorPalette(page, kind).waitFor();
}

export async function choosePaletteColor(page, index = 0) {
  const palette = await resolveVisibleInlinePalette(page);
  const presetChoices = palette.locator('button[title*=": #"]:has(span)');
  const presetCount = await presetChoices.count();

  if (index < presetCount) {
    const swatch = presetChoices.nth(index);
    await swatch.waitFor();
    const label = await swatch.getAttribute("title");
    await clickInlinePaletteChoice(page, swatch);
    return label;
  }

  const defaultLabel =
    presetCount > 0 ? await presetChoices.first().getAttribute("title") : null;
  const wheelChoices = palette.locator('button[title*=": #"]:not(:has(span))');
  const wheelCount = await wheelChoices.count();
  let matchIndex = 0;

  for (let candidateIndex = 0; candidateIndex < wheelCount; candidateIndex += 1) {
    const swatch = wheelChoices.nth(candidateIndex);
    const label = await swatch.getAttribute("title");
    if (!label || label === defaultLabel) {
      continue;
    }

    if (matchIndex === index - presetCount) {
      await clickInlinePaletteChoice(page, swatch);
      return label;
    }

    matchIndex += 1;
  }

  throw new Error(
    `Could not find palette color at index ${index} (presets=${presetCount}, wheel=${wheelCount})`,
  );
}

export async function choosePaletteColorByLabel(page, label) {
  const palette = await resolveVisibleInlinePalette(page);
  const swatch = palette.locator(`button[title="${label}"]`);
  if ((await swatch.count()) === 0) {
    throw new Error(`Could not find a visible palette swatch named "${label}"`);
  }
  await clickInlinePaletteChoice(page, swatch.first());
}

async function clickInlinePaletteChoice(page, swatch) {
  const hasPresetSwatch = (await swatch.locator("span").count()) > 0;
  if (hasPresetSwatch) {
    await swatch.click();
    return;
  }

  const box = await swatch.boundingBox();
  if (!box) {
    throw new Error("Could not resolve wheel swatch bounding box");
  }

  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}

export async function openSlashMenuFromEditor(editor, text) {
  await editor.click();
  await editor.page().keyboard.type(text);
}

export async function createParagraphs(page, texts) {
  if (texts.length === 0) {
    return getEditors(page);
  }

  const firstEditor = await activateFirstEditor(page);
  await clearAndType(firstEditor, texts[0]);

  for (let index = 1; index < texts.length; index += 1) {
    const previousEditor = getEditors(page).nth(index - 1);
    await pressEnter(previousEditor);
    const editor = getEditors(page).nth(index);
    await editor.waitFor();
    await clearAndType(editor, texts[index]);
  }

  return getEditors(page);
}

export function blockLocator(page, index) {
  return page.getByTestId("draggable-block").nth(index);
}

export function blockWrapper(page, index) {
  return page.getByTestId("draggable-block").nth(index);
}

export function blockLocatorForEditor(editor) {
  return editor.locator("xpath=ancestor::*[@data-block-id][1]");
}

/**
 * The `data-block-id` of the block that CONTAINS this editor's block, or null at the root.
 *
 * Asserts nesting structurally. A visual left-edge delta is not a valid proxy for it: the
 * callout is a deliberately FLAT container (BlockEditorSurface.tsx `getNestedTreeClassName`),
 * so a genuinely nested callout child shares its parent's left edge.
 */
export async function parentBlockIdForEditor(editor) {
  return blockLocatorForEditor(editor)
    .locator("xpath=ancestor::*[@data-block-id][1]")
    .getAttribute("data-block-id");
}

export async function editorLeft(editor) {
  const box = await editor.boundingBox();
  if (!box) {
    throw new Error("Could not resolve editor bounding box");
  }

  return box.x;
}

export async function editorTop(editor) {
  const box = await editor.boundingBox();
  if (!box) {
    throw new Error("Could not resolve editor bounding box");
  }

  return box.y;
}

export async function editorHasFocus(editor) {
  return editor.evaluate((node) => node === document.activeElement);
}

export async function selectSlashMenuEntry(page, label, options = {}) {
  const entry = slashMenu(page)
    .getByTestId("slash-command-entry")
    .filter({ hasText: new RegExp(label, "i") })
    .first();
  await entry.waitFor({ timeout: options.timeout ?? 30_000 });
  await entry.scrollIntoViewIfNeeded();
  await entry.click();
}

export async function createBlockViaSlash(page, slashCommand, label, editorIndex = 0) {
  if ((await getEditors(page).count()) === 0) {
    await activateFirstEditor(page);
  }

  const editor = getEditors(page).nth(editorIndex);
  await editor.waitFor();
  await openSlashMenuFromEditor(editor, `/${slashCommand}`);
  try {
    await selectSlashMenuEntry(page, `^${label}$`, { timeout: 1_000 });
  } catch {
    await selectSlashMenuEntry(page, label);
  }
  return editor;
}

export async function createCallout(page) {
  await createBlockViaSlash(page, "callout", "Callout");
  // The callout icon toggle is now "Change callout type" (semantic-type redesign,
  // src/features/block-editor/ui/BlockEditor.tsx) — the old "Change callout icon"
  // aria-label no longer exists.
  await page.getByRole("button", { name: "Change callout type" }).waitFor();
}

export async function createQuote(page) {
  await createBlockViaSlash(page, "quote", "Quote");
}

export async function createToggle(page) {
  await createBlockViaSlash(page, "toggle", "Toggle");
}

export async function createDivider(page) {
  await createBlockViaSlash(page, "divider", "Divider");
}

export async function createCodeBlock(page) {
  await createBlockViaSlash(page, "code", "Code");
  await getCodeTextarea(page).waitFor();
}

/** Deterministic, offline-safe fixture URL for embedding a media asset via the
 *  "Link" tab (no network fetch, no upload — see embedMediaViaLink). */
function mediaFixtureUrl(kind, index = 0) {
  const ext = { image: "png", video: "mp4", audio: "mp3", file: "pdf" }[kind] ?? "bin";
  return `https://example.com/fixtures/${kind}-${index}.${ext}`;
}

/** Embed a media asset through the current MediaEmbedDialog contract
 *  (src/features/block-editor/ui/MediaEmbedDialog.tsx): a modal with Upload/Link/
 *  Unsplash/Giphy tabs — there is no static local gallery to "pick" from anymore,
 *  so the Link tab (deterministic, offline) is the only tab that never depends on
 *  network fetches or a real file. */
export async function embedMediaViaLink(page, kind, url = mediaFixtureUrl(kind)) {
  await mediaBlockPicker(page).waitFor();
  await page.getByRole("tab", { name: "Link" }).click();
  await page.getByPlaceholder(`Paste the ${kind} link…`).fill(url);
  await page.getByRole("button", { name: /^Embed /i }).click();
  await expect(mediaBlockPicker(page)).toHaveCount(0);
}

export async function createMediaBlock(page, slashCommand) {
  await createBlockViaSlash(page, slashCommand, capitalize(slashCommand));
  // Scoped to the media block itself: the sidebar has its own "Add file"
  // buttons (Private/Shared sections) with the identical accessible name.
  await page
    .getByTestId("media-block-editor")
    .getByRole("button", { name: new RegExp(`^Add ${slashCommand}$`, "i") })
    .click();
  await embedMediaViaLink(page, slashCommand);
  // Reveal the settings bar ("Change <kind>") the same way a real user would:
  // click the just-inserted preview (MediaBlockEditor shows it on focus/pointerdown).
  await page.getByTestId("media-block-editor").click();
  await page.getByRole("button", { name: new RegExp(`^Change ${slashCommand}$`, "i") }).waitFor();
}

export async function pickFirstAssetFromVisiblePicker(page) {
  return pickAssetFromVisiblePicker(page);
}

export async function pickAssetFromVisiblePicker(page, selectableIndex = 0) {
  const picker = await resolveVisibleAssetPicker(page);
  const pickerButtons = picker.locator(
    [
      'button[title]',
      ':not([title="Text color"])',
      ':not([title="Background color"])',
      ':not([title="Bold"])',
      ':not([title="Italic"])',
      ':not([title="Strikethrough"])',
      ':not([title="Add link"])',
      ':not([title="Inline code"])',
      ':not([title="Open slash menu"])',
      ':not([title="Click to change icon"])',
      ':not([title="Change callout type"])',
      ':not([title="Change page icon"])',
      ':not([title="New page"])',
      ':not([title="Close sidebar"])',
      ':not([title="More options"])',
      ':not([title="Page options"])',
      ':not([title="Add child page"])',
      ':not([title="Open menu"])',
      ':not([title="Add to Private"])',
      ':not([data-testid="block-drag-handle"])',
    ].join(""),
  );

  // The Icons/GIFs tabs are lazy (React.lazy + Suspense) AND virtualized
  // (react-virtual measures the scroll container via ResizeObserver on first
  // mount, VirtualRows.tsx) — right after switching tabs there can be a frame
  // with zero rendered rows before it settles. Wait for the real paint instead
  // of a one-shot count() (never a sleep).
  await pickerButtons.first().waitFor({ state: "attached" }).catch(() => undefined);

  const count = await pickerButtons.count();
  for (let index = 0; index < count; index += 1) {
    const label = await pickerButtons.nth(index).getAttribute("title");
    if (!label) {
      continue;
    }

    if (
      [
        "Emoji",
        "SVG",
        "Icons",
        "Smileys",
        "People",
        "Animals",
        "Food",
        "Travel",
        "Activities",
        "Objects",
        "Symbols",
        "Flags",
        "Photos",
        "Images",
        "Videos",
        "Audio",
      "Files",
      ].includes(label)
    ) {
      continue;
    }

    if (selectableIndex === 0) {
      await pickerButtons.nth(index).click();
      return label;
    }

    selectableIndex -= 1;
  }

  throw new Error("Could not find a selectable asset inside the visible picker");
}

export async function wrapperCount(editor, selector) {
  return editor.evaluate(
    (node, selectorValue) => node.querySelectorAll(selectorValue).length,
    selector,
  );
}

export async function openBlockContextMenuForEditor(editor) {
  const block = blockLocatorForEditor(editor);
  await block.click({ button: "right" });
}

export function contextMenuItem(page, label) {
  return page.locator(`[role="menuitem"]`).filter({
    has: page.locator(".text-sm.flex-1", { hasText: new RegExp(`^${escapeRegex(label)}$`) }),
  });
}

export function contextSubMenuItem(page, label) {
  return page.locator(`[role="menu"] button`).filter({
    has: page.locator(".text-sm.flex-1", { hasText: new RegExp(`^${escapeRegex(label)}$`) }),
  });
}

export async function pasteText(editor, text) {
  const page = editor.page();
  await ensureClipboardAccess(page);
  const beforeHtml = await editorHtml(editor);
  const handle = await editor.elementHandle();
  if (!handle) {
    throw new Error("Could not resolve editor element for paste verification");
  }
  await page.evaluate(async (value) => {
    await navigator.clipboard.writeText(value);
  }, text);
  await editor.click();
  await page.keyboard.press(`${modifier()}+V`);

  try {
    await page.waitForFunction(
      ([node, previousHtml]) =>
        !node.isConnected ||
        node.innerHTML !== previousHtml ||
        Boolean(document.querySelector("textarea")),
      [handle, beforeHtml],
    );
  } finally {
    await handle.dispose();
  }
}

export async function pasteTextAtCurrentCaret(page, text) {
  await ensureClipboardAccess(page);
  await page.evaluate(async (value) => {
    await navigator.clipboard.writeText(value);
  }, text);
  await page.keyboard.press(`${modifier()}+V`);
  await waitForRenderStability(page);
}

export async function ensureClipboardAccess(page) {
  const origin = new URL(page.url()).origin;
  await page.context().grantPermissions(
    ["clipboard-read", "clipboard-write"],
    { origin },
  );
}

export async function readClipboardText(page) {
  await ensureClipboardAccess(page);
  return page.evaluate(async () => navigator.clipboard.readText());
}

export async function dragBlockTo(page, fromIndex, toIndex, targetPosition = "above") {
  const source = page.getByRole("button", { name: /Drag to reorder block/i }).nth(fromIndex);
  const target = blockLocator(page, toIndex);
  const targetBox = await target.boundingBox();

  if (!targetBox) {
    throw new Error("Could not resolve target block bounding box");
  }

  await source.dragTo(target, {
    targetPosition: {
      x: Math.min(24, Math.max(8, targetBox.width / 2)),
      y: targetPosition === "above" ? 2 : Math.max(4, targetBox.height - 2),
    },
  });
}

export async function startSyntheticBlockDrag(page, fromIndex) {
  const handle = page
    .getByRole("button", { name: /Drag to reorder block/i })
    .nth(fromIndex);
  const dataTransfer = await page.evaluateHandle(() => new DataTransfer());
  await handle.dispatchEvent("dragstart", { dataTransfer });
  return dataTransfer;
}

export async function dragOverBlock(page, toIndex, dataTransfer, targetPosition = "above") {
  const target = blockLocator(page, toIndex);
  const targetBox = await target.boundingBox();

  if (!targetBox) {
    throw new Error("Could not resolve drag target bounding box");
  }

  await target.dispatchEvent("dragover", {
    dataTransfer,
    clientX: targetBox.x + Math.min(24, Math.max(8, targetBox.width / 2)),
    clientY:
      targetBox.y +
      (targetPosition === "above" ? 2 : Math.max(4, targetBox.height - 2)),
  });
}

export async function endSyntheticBlockDrag(page, fromIndex, dataTransfer) {
  const handle = page
    .getByRole("button", { name: /Drag to reorder block/i })
    .nth(fromIndex);
  await handle.dispatchEvent("dragend", { dataTransfer });
  await dataTransfer.dispose();
}

export async function blockOpacity(page, index) {
  return blockWrapper(page, index).evaluate((node) =>
    Number.parseFloat(getComputedStyle(node).opacity),
  );
}

export async function visibleBlockTexts(page) {
  return getEditors(page).evaluateAll((nodes) =>
    nodes.map((node) => node.textContent?.replaceAll(/\s+/g, " ").trim() ?? ""),
  );
}

export async function clickOutside(page) {
  await page.getByTestId("app-shell").click({ position: { x: 8, y: 8 } });
}

async function resolveVisibleAssetPicker(page) {
  const candidates = [
    page.getByTestId("media-asset-picker"),
    page.getByTestId("media-block-picker"),
    page.getByTestId("page-cover-picker"),
    page.getByTestId("emoji-picker"),
    page.getByTestId("slash-media-picker"),
  ];

  for (const candidate of candidates) {
    const count = await candidate.count();
    if (count === 0) {
      continue;
    }

    const visibleCandidate = candidate.last();
    if (await visibleCandidate.isVisible()) {
      return visibleCandidate;
    }
  }

  throw new Error("Could not find a visible asset picker container");
}

async function resolveVisibleInlinePalette(page) {
  const candidates = [
    page.getByTestId("inline-text-color-palette"),
    page.getByTestId("inline-background-color-palette"),
  ];

  for (const candidate of candidates) {
    const count = await candidate.count();
    if (count === 0) {
      continue;
    }

    if (await candidate.last().isVisible()) {
      return candidate.last();
    }
  }

  throw new Error("Could not find a visible inline color palette");
}

function capitalize(value) {
  return value.slice(0, 1).toUpperCase() + value.slice(1);
}

function escapeRegex(value) {
  return value.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
}

function modifier() {
  return process.platform === "darwin" ? "Meta" : "Control";
}
