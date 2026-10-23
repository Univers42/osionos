// The settings screen, the BaaS console and the chat message row each carried
// a private copy of a kit component, so a change to the kit's look skipped
// them. These checks read the source: a copy that comes back fails here.
// Since P1-3a splits the settings surface into one module per panel, every read
// covers the whole `src/features/settings/` tree — a panel file is just as
// likely a copy location as the old shell was.

import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

const SETTINGS_ROOT = "src/features/settings";
const settingsFiles = readdirSync(new URL(`../../${SETTINGS_ROOT}`, import.meta.url), { recursive: true })
  .filter((entry) => entry.endsWith(".tsx"))
  .map((entry) => `${SETTINGS_ROOT}/${entry}`);
const settingsSources = settingsFiles.map((path) => read(path));

function kitImports(source: string): string[] {
  const block = /import\s*\{([^}]*)\}\s*from\s*['"]@\/shared\/ui['"]/.exec(source);
  return block ? block[1].split(",").map((name) => name.trim().split(/\s+as\s+/)[0]) : [];
}

test("no file under settings defines or renders the kit components it used to copy", () => {
  for (const [index, source] of settingsSources.entries()) {
    const where = `${settingsFiles[index]}: `;
    for (const name of ["Button", "Switch", "SelectButton"]) {
      assert.doesNotMatch(source, new RegExp(`const ${name}\\b`), `${where}local ${name} is back`);
    }
    // <Button> is the kit's now; the other two names exist only as the removed copies.
    for (const name of ["Switch", "SelectButton"]) {
      assert.doesNotMatch(source, new RegExp(`<${name}\\b`), `${where}<${name}> is still rendered`);
    }
  }
});

test("settings files together take Button, Toggle, Dropdown and IconButton from the kit facade", () => {
  const names = new Set(settingsSources.flatMap((source) => kitImports(source)));
  for (const name of ["Button", "Toggle", "Dropdown", "IconButton"]) {
    assert.ok(names.has(name), `${name} is not imported from @/shared/ui anywhere under settings/`);
  }
});

/** Panels load as separate chunks in P1-3b, so each module is bounded the same way as the shell. */
const PANEL_FOLDERS = [
  "ui", "model", "profile", "preferences", "general", "notifications", "mail-calendar",
  "import", "page-settings", "ai", "public-pages", "library", "teamspaces", "billing", "plans",
  "moderation",
];
const PEOPLE_PANEL_FILE = "people/PeoplePanel.tsx";

function lines(source: string): number {
  return source.split("\n").length - (source.endsWith("\n") ? 1 : 0);
}

function filesUnderPanelFolder(folder: "ui" | "model" | (typeof PANEL_FOLDERS)[number] | "people"): string[] {
  const base = `${SETTINGS_ROOT}/${folder}`;
  const include = (entry: string) => /\.tsx?$/.test(entry) && (folder !== "people" || entry === PEOPLE_PANEL_FILE);
  return readdirSync(new URL(`../../${base}`, import.meta.url), { recursive: true })
    .filter(include)
    .map((entry) => `${base}/${entry}`);
}

test("SettingsView and every panel module stay within the 300-line file-size rule", () => {
  assert.ok(lines(read("src/features/settings/ui/SettingsView.tsx")) <= 300);
  for (const folder of ["ui", "model"] as const) {
    for (const path of filesUnderPanelFolder(folder)) assert.ok(lines(read(path)) <= 300, `${path} exceeds 300 lines`);
  }
  for (const folder of ["profile", "preferences", "general", "notifications", "mail-calendar", "import", "page-settings", "ai", "voice", "public-pages", "library", "teamspaces", "billing", "plans", "moderation"] as const) {
    for (const path of filesUnderPanelFolder(folder)) assert.ok(lines(read(path)) <= 300, `${path} exceeds 300 lines`);
  }
  assert.ok(lines(read(`${SETTINGS_ROOT}/${PEOPLE_PANEL_FILE}`)) <= 300);
});

// A panel importing another panel would defeat the P1-3b lazy load: opening one
// pane would pull in every other pane's chunk. ui/ and model/ helpers are
// allowed to every panel; ui/, model/ and the tree under `people/` (only
// PeoplePanel is a panel) are shared or pre-existing and carry no such rule.
const PANEL_MODULES = [
  "profile", "preferences", "general", "notifications", "mail-calendar", "import",
  "page-settings", "ai", "voice", "public-pages", "library", "teamspaces", "billing", "plans",
  "moderation",
];

test("no panel module imports another panel module", () => {
  const moduleFiles = [
    ...PANEL_MODULES.map((folder) => ({ folder, files: filesUnderPanelFolder(folder) })),
    { folder: "people", files: filesUnderPanelFolder("people") },
  ];
  for (const { folder, files } of moduleFiles) {
    for (const path of files) {
      const source = read(path);
      for (const other of moduleFiles.filter((module) => module.folder !== folder)) {
        const hint = `${path} imports ${other.folder}`;
        assert.doesNotMatch(source, new RegExp(`from ['"]@/features/settings/${other.folder}/`), hint);
        assert.doesNotMatch(source, new RegExp(`from ['"]\\.\\./${other.folder}/`), hint);
      }
    }
  }
});

test("the console has no private button; its call sites use the kit Button", () => {
  assert.doesNotMatch(read("src/features/baas-console/ui/consolePrimitives.tsx"), /ConsoleButton/);
  for (const file of ["ApiKeysSection", "CreateKeyModal", "PlanPanel"]) {
    const source = read(`src/features/baas-console/ui/${file}.tsx`);
    assert.doesNotMatch(source, /ConsoleButton/, `${file} still uses ConsoleButton`);
    assert.ok(kitImports(source).includes("Button"), `${file} does not import Button from @/shared/ui`);
  }
});

/** The opening tag of every `<tag …>` in `source`; a `>` inside `{…}` (an arrow function) does not end it. */
function openingTags(source: string, tag: string): string[] {
  const tags: string[] = [];
  for (const match of source.matchAll(new RegExp(`<${tag}(?=[\\s>])`, "g"))) {
    let depth = 0;
    let end = match.index;
    for (; end < source.length; end++) {
      if (source[end] === "{") depth++;
      else if (source[end] === "}") depth--;
      else if (source[end] === ">" && depth === 0) break;
    }
    tags.push(source.slice(match.index, end + 1));
  }
  return tags;
}

// A reaction is a toggle chip: the kit Button sets its own control radius,
// which wins over the chip's pill shape, so the chip is the one raw button.
test("MessageRow: icon actions are IconButtons, text actions are Buttons, a reaction is a chip", () => {
  const messageRow = read("src/widgets/channel-messages/ui/MessageRow.tsx");
  const raw = openingTags(messageRow, "button");
  assert.ok(raw.length > 0, "the reaction chip is gone");
  for (const tag of raw) assert.match(tag, /className="osio-chip\b/, "a raw <button> that is not a chip");
  for (const tag of openingTags(messageRow, "Button")) assert.doesNotMatch(tag, /osio-chip/, "a kit Button styled as a chip");
  const names = kitImports(messageRow);
  assert.ok(names.includes("IconButton") && names.includes("Button"));
});
