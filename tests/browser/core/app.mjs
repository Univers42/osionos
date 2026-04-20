import process from "node:process";

export async function openFreshPage(page, appUrl) {
  await page.goto(appUrl, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /New page/i }).last().click();
  await page.getByRole("textbox", { name: "Page title" }).waitFor();
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

export async function editorText(editor) {
  return (await editor.textContent()) ?? "";
}

export async function editorHtml(editor) {
  return editor.evaluate((node) => node.innerHTML);
}

export async function clearAndType(editor, text) {
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
    await editor.page().keyboard.type(text);
  }
}

export async function focusEditorStart(editor) {
  await editor.click();
  await editor.press("Home");
}

export async function focusEditorEnd(editor) {
  await editor.click();
  await editor.evaluate((node) => {
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(node);
    range.collapse(false);
    selection?.removeAllRanges();
    selection?.addRange(range);
  });
  await editor.page().waitForTimeout(50);
}

export async function pressEnter(editor) {
  await focusEditorEnd(editor);
  await editor.page().keyboard.press("Enter");
}

export async function pressTab(target, options = {}) {
  await target.click();
  await target.page().keyboard.press(options.shift ? "Shift+Tab" : "Tab");
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
  for (let index = 0; index < text.length; index += 1) {
    await editor.press("ArrowRight");
  }
  await editor.page().keyboard.up("Shift");
  await editor.page().waitForTimeout(150);
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

  await editor.page().waitForTimeout(100);
}

export async function expectToolbar(page) {
  await page.locator('button[title="Bold"]').waitFor();
}

export function toolbarButton(page, title) {
  return page.locator(`button[title="${title}"]`);
}

export async function openColorPalette(page, kind) {
  await toolbarButton(
    page,
    kind === "text" ? "Text color" : "Background color",
  ).click();
  await page.locator('button[aria-pressed="false"]').first().waitFor();
}

export async function choosePaletteColor(page, index = 0) {
  const swatch = page.locator('button[aria-pressed="false"]:visible').nth(index);
  const label = await swatch.getAttribute("aria-label");
  await swatch.click({ force: true });
  return label;
}

export async function choosePaletteColorByLabel(page, label) {
  const swatches = page.locator('button[aria-label]:visible');
  const swatchIndex = await swatches.evaluateAll(
    (nodes, targetLabel) =>
      nodes.findIndex(
        (node) => node.getAttribute("aria-label") === targetLabel,
      ),
    label,
  );

  if (swatchIndex < 0) {
    throw new Error(`Could not find a visible palette swatch named "${label}"`);
  }

  await swatches.nth(swatchIndex).click({ force: true });
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
  return page.locator("[data-block-id]").nth(index);
}

export function blockLocatorForEditor(editor) {
  return editor.locator("xpath=ancestor::*[@data-block-id][1]");
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

export async function selectSlashMenuEntry(page, label) {
  await page
    .locator("button:visible", { hasText: new RegExp(label, "i") })
    .first()
    .click();
}

export async function createBlockViaSlash(page, slashCommand, label, editorIndex = 0) {
  if ((await getEditors(page).count()) === 0) {
    await activateFirstEditor(page);
  }

  const editor = getEditors(page).nth(editorIndex);
  await editor.waitFor();
  await openSlashMenuFromEditor(editor, `/${slashCommand}`);
  await selectSlashMenuEntry(page, `^${label}$`);
  return editor;
}

export async function createCallout(page) {
  await createBlockViaSlash(page, "callout", "Callout");
  await page.getByRole("button", { name: "Change callout icon" }).waitFor();
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
  await page.locator("textarea").waitFor();
}

export async function createMediaBlock(page, slashCommand) {
  await createBlockViaSlash(page, slashCommand, capitalize(slashCommand));
  await page.getByRole("button", { name: /^Close$/ }).waitFor();
  await pickFirstAssetFromVisiblePicker(page);
}

export async function pickFirstAssetFromVisiblePicker(page) {
  return pickAssetFromVisiblePicker(page);
}

export async function pickAssetFromVisiblePicker(page, selectableIndex = 0) {
  const pickerButtons = page.locator(
    [
      'button[title]:visible',
      ':not([title="Text color"])',
      ':not([title="Background color"])',
      ':not([title="Bold"])',
      ':not([title="Italic"])',
      ':not([title="Strikethrough"])',
      ':not([title="Add link"])',
      ':not([title="Inline code"])',
      ':not([title="Open slash menu"])',
      ':not([title="Click to change icon"])',
      ':not([title="Change callout icon"])',
      ':not([title="Change page icon"])',
      ':not([title="New page"])',
      ':not([title="Close sidebar"])',
      ':not([title="More options"])',
      ':not([title="Page options"])',
      ':not([title="Add child page"])',
      ':not([title="Open menu"])',
      ':not([title="Add to Private"])',
      ':not([title="Drag to reorder"])',
    ].join(""),
  );

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
  return page.getByRole("button", { name: new RegExp(`^${escapeRegex(label)}$`) });
}

export async function pasteText(editor, text) {
  const page = editor.page();
  const origin = new URL(page.url()).origin;
  await page.context().grantPermissions(
    ["clipboard-read", "clipboard-write"],
    { origin },
  );
  await page.evaluate(async (value) => {
    await navigator.clipboard.writeText(value);
  }, text);
  await editor.click();
  await page.keyboard.press(`${modifier()}+V`);
  await page.waitForTimeout(100);
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

export async function visibleBlockTexts(page) {
  return page.locator("[data-block-id]").evaluateAll((nodes) =>
    nodes.map((node) => node.textContent?.replace(/\s+/g, " ").trim() ?? ""),
  );
}

export async function clickOutside(page) {
  await page.mouse.click(24, 24);
}

function capitalize(value) {
  return value.slice(0, 1).toUpperCase() + value.slice(1);
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function modifier() {
  return process.platform === "darwin" ? "Meta" : "Control";
}
