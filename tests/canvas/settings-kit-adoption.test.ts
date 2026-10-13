// The settings screen, the BaaS console and the chat message row each carried
// a private copy of a kit component, so a change to the kit's look skipped
// them. These checks read the source: a copy that comes back fails here.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

const settings = read("src/features/settings/SettingsCenter.tsx");
const consolePrimitives = read("src/features/baas-console/ui/consolePrimitives.tsx");
const messageRow = read("src/widgets/channel-messages/ui/MessageRow.tsx");

function kitImports(source: string): string[] {
  const block = /import\s*\{([^}]*)\}\s*from\s*['"]@\/shared\/ui['"]/.exec(source);
  return block ? block[1].split(",").map((name) => name.trim().split(/\s+as\s+/)[0]) : [];
}

test("SettingsCenter defines none of the kit components it used to copy", () => {
  for (const name of ["Button", "Switch", "SelectButton"]) {
    assert.doesNotMatch(settings, new RegExp(`const ${name}\\b`), `local ${name} is back`);
    assert.doesNotMatch(settings, new RegExp(`<${name}\\b`), `<${name}> is still rendered`);
  }
});

test("SettingsCenter takes Button, Toggle, Dropdown and IconButton from the kit facade", () => {
  const names = kitImports(settings);
  for (const name of ["Button", "Toggle", "Dropdown", "IconButton"]) {
    assert.ok(names.includes(name), `${name} is not imported from @/shared/ui`);
  }
});

test("the console has no private button; its call sites use the kit Button", () => {
  assert.doesNotMatch(consolePrimitives, /ConsoleButton/);
  for (const file of ["ApiKeysSection", "CreateKeyModal", "PlanPanel"]) {
    const source = read(`src/features/baas-console/ui/${file}.tsx`);
    assert.doesNotMatch(source, /ConsoleButton/, `${file} still uses ConsoleButton`);
    assert.ok(kitImports(source).includes("Button"), `${file} does not import Button from @/shared/ui`);
  }
});

test("MessageRow renders no raw <button>: icon actions are IconButtons, text actions are Buttons", () => {
  assert.doesNotMatch(messageRow, /<button/);
  const names = kitImports(messageRow);
  assert.ok(names.includes("IconButton") && names.includes("Button"));
});
