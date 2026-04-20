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

export async function openSlashMenuFromEditor(editor, text) {
  await editor.click();
  await editor.page().keyboard.type(text);
}

export async function selectSlashMenuEntry(page, label) {
  await page
    .locator("button:visible", { hasText: new RegExp(label, "i") })
    .first()
    .click();
}

export async function createCallout(page) {
  const editor = await activateFirstEditor(page);
  await openSlashMenuFromEditor(editor, "/callout");
  await selectSlashMenuEntry(page, "^Callout$");
  await page.getByRole("button", { name: "Change callout icon" }).waitFor();
}

export async function createMediaBlock(page, slashCommand) {
  const editor = await activateFirstEditor(page);
  await openSlashMenuFromEditor(editor, `/${slashCommand}`);
  await selectSlashMenuEntry(page, `^${capitalize(slashCommand)}$`);
  await page.getByRole("button", { name: /^Close$/ }).waitFor();
  await pickFirstAssetFromVisiblePicker(page);
}

export async function pickFirstAssetFromVisiblePicker(page) {
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

    await pickerButtons.nth(index).click();
    return label;
  }

  throw new Error("Could not find a selectable asset inside the visible picker");
}

export async function wrapperCount(editor, selector) {
  return editor.evaluate(
    (node, selectorValue) => node.querySelectorAll(selectorValue).length,
    selector,
  );
}

function capitalize(value) {
  return value.slice(0, 1).toUpperCase() + value.slice(1);
}

function modifier() {
  return process.platform === "darwin" ? "Meta" : "Control";
}
