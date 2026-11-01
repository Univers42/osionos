// A3 with VS Code's panel (devil amendment 2, T8): the terminal page's service overrides register no
// service of their own from the task, debug, extensions, extension-gallery, remote-agent, scm or
// search overrides, so nothing on the page runs code on its own. The workspace stays untrusted.
// Not covered here: monaco-vscode-api's initialize() adds the extensions override's services itself
// (services.js:113), whatever the page passes; vite.terminal.config.ts says why that one is allowed.
import "./support/vscode-stub-dom.ts";
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const { terminalModeServices, terminalWorkbenchOptions } = await import("../../src/terminal-client/services.ts");

const BANNED = ["task", "debug", "extensions", "extension-gallery", "remote-agent", "scm", "search"];
const packageOf = (name: string) => `@codingame/monaco-vscode-${name}-service-override`;

async function keysOf(name: string): Promise<string[]> {
  const override = (await import(packageOf(name))) as { default: () => Record<string, unknown> };
  return Object.keys(override.default());
}

// What a banned override registers itself. remote-agent spreads the environment override into its
// map and extensions the files one; both are allowed on the page, so their ids are not banned.
async function ownKeysOf(name: string): Promise<string[]> {
  const manifestUrl = new URL("package.json", import.meta.resolve(packageOf(name)));
  const manifest = JSON.parse(readFileSync(manifestUrl, "utf8")) as { dependencies?: Record<string, string> };
  const spread = Object.keys(manifest.dependencies ?? {})
    .map((dep) => /^@codingame\/monaco-vscode-(.+)-service-override$/.exec(dep)?.[1])
    .filter((dep): dep is string => dep !== undefined && !BANNED.includes(dep));
  const inherited = new Set((await Promise.all(spread.map(keysOf))).flat());
  return (await keysOf(name)).filter((id) => !inherited.has(id));
}

function bannedIn(keys: Set<string>, banned: Map<string, string[]>): string[] {
  return [...banned].flatMap(([name, ids]) => ids.filter((id) => keys.has(id)).map((id) => `${name}: ${id}`));
}

test("the terminal page's overrides register no service of the seven banned overrides", async () => {
  const banned = new Map<string, string[]>();
  for (const name of BANNED) banned.set(name, await ownKeysOf(name));
  // Each banned override registers something of its own, so an empty intersection is not vacuous.
  for (const [name, ids] of banned) assert.ok(ids.length > 0, `${name} registers no service`);

  const keys = new Set(Object.keys(terminalModeServices({} as never)));
  // VS Code's panel and terminal are in the map, so the check reads the real one. (The terminal
  // override can be asked only once: it registers the backend it is given.)
  const views = await keysOf("views");
  assert.ok(views.length > 0 && views.every((id) => keys.has(id)));
  assert.ok(keys.has("terminalService"));
  assert.deepEqual(bannedIn(keys, banned), []);

  // Negative control: the same check catches the task override once it is added.
  const withTasks = new Set([...keys, ...(banned.get("task") ?? [])]);
  assert.notDeepEqual(bannedIn(withTasks, banned), []);
});

test("the terminal page's workspace is untrusted", () => {
  const options = terminalWorkbenchOptions({});
  assert.equal(options.workspaceProvider.trusted, false);
  assert.equal(options.workspaceProvider.workspace, undefined);
});
