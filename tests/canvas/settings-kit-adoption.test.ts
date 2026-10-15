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
  }
  // <Button> is the kit's now; the other two names exist only as the removed copies.
  for (const name of ["Switch", "SelectButton"]) {
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
  const raw = openingTags(messageRow, "button");
  assert.ok(raw.length > 0, "the reaction chip is gone");
  for (const tag of raw) assert.match(tag, /className="osio-chip\b/, "a raw <button> that is not a chip");
  for (const tag of openingTags(messageRow, "Button")) assert.doesNotMatch(tag, /osio-chip/, "a kit Button styled as a chip");
  const names = kitImports(messageRow);
  assert.ok(names.includes("IconButton") && names.includes("Button"));
});
