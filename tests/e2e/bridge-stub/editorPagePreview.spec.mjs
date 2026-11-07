// The editor page's Markdown preview in Chrome (devil verdict 2026-11-07 editor-page preview, EP13,
// EP27, EP29): the built page served by the real static-client with its enforced CSP. Records zero
// console errors and CSP violations, a relative link that leaves the frame on /editor/index.html,
// unsaved text surviving 3 toggles, and a parse worker that keeps hostile files off the editor.

import { readFileSync } from "node:fs";

import { expect, test } from "@playwright/test";

import { openSignedIn } from "../support/bridgeStub.mjs";
import { seedSession } from "../support/bridgeSession.mjs";
import { NODE_ORIGIN, editorPageBuilt, routeFsToNode, startRememberingNode, stubMachineBridge } from "../support/rememberedNode.mjs";

const README = [
  "# Preview check",
  "",
  "Read the [guide](docs/guide.md), the [api](/api/machine/self) or [a site](https://example.com).",
  "",
  "- [x] done",
  "- [ ] open",
  "",
].join("\n");

const HOSTILE = [
  "<script>alert(1)</script>",
  "<img src=x onerror=alert(1)>",
  "[js](javascript:alert(1)) [data](data:text/html,<b>x</b>)",
  "![remote](https://img.example/cat.png) ![pic](javascript:alert(1))",
  "",
].join("\n\n");

// PREVIEW_MAX_CHARS (1 MiB) of the engine's own sample, cut at a line end: the EP27 timing input.
const ONE_MIB = 1 << 20;
const SAMPLE = readFileSync(new URL("../../../packages/markdown-engine/testing_markdown.md", import.meta.url), "utf8");
const FILLED = SAMPLE.repeat(Math.ceil(ONE_MIB / SAMPLE.length));
const BIG = FILLED.slice(0, FILLED.lastIndexOf("\n", ONE_MIB - 1) + 1);
// EP29's fixture: 1,048,575 chars of unclosed emphasis openers on one line, far past the parse
// budget in any engine version. One typed character lands exactly on the cap, never past it.
const SLOW = "*a ".repeat(349525);

const TOGGLE = "Control+Shift+V";

// Every frame of the node reports its CSP violations here; Playwright's init script runs under any CSP.
function recordViolations() {
  globalThis.__cspViolations = [];
  document.addEventListener("securitypolicyviolation", (event) => {
    globalThis.__cspViolations.push(`${event.violatedDirective} ${event.blockedURI}`);
  });
}

// Each worker's URL, and post → answer time for every preview request (a message carrying `source`).
function timePreviewWorkers() {
  const Native = globalThis.Worker;
  if (typeof Native !== "function") return;
  globalThis.__workerUrls = [];
  globalThis.__previewTimings = [];
  globalThis.Worker = class TimedWorker extends Native {
    constructor(url, options) {
      super(url, options);
      globalThis.__workerUrls.push(String(url));
      this.sentAt = new Map();
      this.addEventListener("message", ({ data }) => {
        const sent = this.sentAt.get(data?.id);
        if (sent) globalThis.__previewTimings.push({ ms: performance.now() - sent.at, chars: sent.chars, document: data.document?.ok ? "ok" : data.document?.reason });
      });
    }
    postMessage(message, transfer) {
      if (typeof message?.source === "string") this.sentAt.set(message.id, { at: performance.now(), chars: message.source.length });
      return transfer === undefined ? super.postMessage(message) : super.postMessage(message, transfer);
    }
  };
}

async function signInToNode(context, page, baseURL, node) {
  await stubMachineBridge(context, node);
  await routeFsToNode(context, node);
  await context.addInitScript(recordViolations);
  await context.addInitScript(timePreviewWorkers);
  const nodeConsole = [];
  context.on("console", (message) => {
    if (message.type() === "error" && message.location().url.startsWith(NODE_ORIGIN)) nodeConsole.push(message.text());
  });
  await seedSession(context, {});
  await openSignedIn(page, baseURL);
  // The Explorer tab is selected on load; a click on the selected tab would close the sidebar.
  await page.getByRole("region", { name: "This computer" }).getByRole("button", { name: "This computer", exact: true }).click();
  const prompt = page.getByRole("dialog", { name: "Confirm it's you" });
  await prompt.getByRole("button", { name: "Email me a code" }).click();
  await prompt.getByLabel("Six-digit code").fill("123456");
  await prompt.getByRole("button", { name: "Confirm" }).click();
  return nodeConsole;
}

async function openMachineFile(page, name) {
  const explorer = page.frameLocator('iframe[title="Folders on this computer"]');
  await explorer.getByRole("treeitem", { name, exact: true }).click();
  // Every open tab keeps its frame; only the active one is shown.
  const frame = page.locator('iframe[title="File on this computer"]:visible').contentFrame();
  await expect(frame.locator(".monaco-editor")).toBeVisible({ timeout: 60_000 });
  return frame;
}

async function openInSplit(page, name) {
  const file = await openMachineFile(page, name);
  await file.getByRole("button", { name: "Split", exact: true }).click();
  return { file, preview: file.getByRole("region", { name: "Preview" }) };
}

const nodeFrame = (page) => page.frames().find((frame) => frame.url().startsWith(`${NODE_ORIGIN}/editor/index.html?view=file`));

async function expectQuietNode(page, nodeConsole, extra = {}) {
  const violations = await Promise.all(page.frames().filter((frame) => frame.url().startsWith(NODE_ORIGIN))
    .map((frame) => frame.evaluate(() => globalThis.__cspViolations ?? [])));
  test.info().attachments.push({ name: "node console + CSP", contentType: "application/json", body: Buffer.from(JSON.stringify({ nodeConsole, violations, ...extra })) });
  expect(violations.flat(), "CSP violations in the node's frames").toEqual([]);
  expect(nodeConsole, "console errors in the node's frames").toEqual([]);
}

test.beforeEach(() => {
  test.skip(!editorPageBuilt(), "build the editor page first: bash scripts/docker-run.sh build-editor");
  test.setTimeout(300_000);
});

test("EP13: the editor page previews .md under its real CSP, keeps unsaved text, and stays put on a link click", async ({ context, page, baseURL }) => {
  const node = await startRememberingNode(new URL(baseURL).origin, { project: { "README.md": README, "hostile.md": HOSTILE } });
  try {
    const nodeConsole = await signInToNode(context, page, baseURL, node);
    const file = await openMachineFile(page, "README.md");
    const preview = file.getByRole("region", { name: "Preview" });
    await file.locator(".monaco-editor .view-lines").click();
    await page.keyboard.press("Control+End");
    await page.keyboard.type("unsaved line");
    for (let cycle = 0; cycle < 3; cycle += 1) {
      await page.keyboard.press(TOGGLE);
      await expect(preview).toBeVisible();
      await expect(preview).toBeFocused();
      await expect(preview.getByRole("heading", { name: "Preview check" })).toBeVisible();
      await page.keyboard.press(TOGGLE);
      await expect(preview).toHaveCount(0);
    }
    await expect(file.locator(".monaco-editor .view-lines")).toContainText("unsaved line");

    await page.keyboard.press(TOGGLE);
    await expect(preview.getByText("unsaved line")).toBeVisible({ timeout: 5_000 });
    // A relative link renders as its words, inside the paragraph's own text: a click navigates nothing.
    await expect(preview.getByRole("link", { name: "guide" })).toHaveCount(0);
    await expect(preview.getByRole("link", { name: "api" })).toHaveCount(0);
    await preview.getByText(/^Read the guide, the api or/).click({ position: { x: 2, y: 2 } });
    expect(nodeFrame(page)?.url()).toMatch(/\/editor\/index\.html\?view=file$/);
    await expect(preview.getByRole("link", { name: "a site" })).toHaveAttribute("target", "_blank");

    const hostile = await openMachineFile(page, "hostile.md");
    await hostile.getByRole("button", { name: "Preview", exact: true }).click();
    const hostilePreview = hostile.getByRole("region", { name: "Preview" });
    await expect(hostilePreview.getByText("<script>alert(1)</script>")).toBeVisible();
    await expect(hostilePreview.locator("img, script, iframe")).toHaveCount(0);
    await expectQuietNode(page, nodeConsole);
  } finally {
    node.stop();
  }
});

test("EP27/EP29: the parse runs in a worker from /editor/assets/, and deep or slow files never stall the editor", async ({ context, page, baseURL }) => {
  const project = { "big.md": BIG, "deep.md": `${"- ".repeat(5000)}x\n`, "deep-1000.md": `${"- ".repeat(1000)}x\n`, "slow.md": SLOW };
  const node = await startRememberingNode(new URL(baseURL).origin, { project });
  try {
    const nodeConsole = await signInToNode(context, page, baseURL, node);

    const big = await openInSplit(page, "big.md");
    await expect(big.preview.getByRole("heading", { name: "1. Pruebas de Encabezados" }).first()).toBeVisible({ timeout: 30_000 });
    const workerUrls = await nodeFrame(page).evaluate(() => globalThis.__workerUrls);
    const workerUrl = workerUrls.find((url) => /\/previewParse\.worker-[\w-]+\.js$/.test(url));
    expect(workerUrl, `the preview worker among ${workerUrls.join(", ")}`).toMatch(new RegExp(`^${NODE_ORIGIN}/editor/assets/`));
    const served = await context.request.get(workerUrl);
    expect(served.status()).toBe(200);
    expect(served.headers()["content-type"]).toMatch(/^text\/javascript/);
    const bigTimings = (await nodeFrame(page).evaluate(() => globalThis.__previewTimings)).filter((timing) => timing.chars === BIG.length);
    expect(bigTimings.map((timing) => timing.document)).toContain("ok");
    const bigMs = Math.min(...bigTimings.map((timing) => timing.ms));
    expect(bigMs, "Chromium post → result for 1 MiB of testing_markdown.md").toBeLessThanOrEqual(1_000);

    const deep = await openInSplit(page, "deep.md");
    await expect(deep.preview.getByText("This file is too deeply nested to preview.")).toBeVisible({ timeout: 15_000 });
    await expect(deep.file.locator(".monaco-editor .view-lines")).toContainText("- - - -");
    const deep1000 = await openInSplit(page, "deep-1000.md");
    const deepOutcome = deep1000.preview.getByText(/too deeply nested/).or(deep1000.preview.getByText("x", { exact: true }));
    await expect(deepOutcome.first()).toBeVisible({ timeout: 15_000 });
    const deep1000Shown = (await deep1000.preview.getByText(/too deeply nested/).count()) > 0 ? "tooDeep" : "rendered";

    // The worker grinds on the first post while Monaco takes a keystroke; the budget then ends it.
    // Monaco stops drawing a line after 10,000 chars, so the status bar's column proves the key.
    const slow = await openInSplit(page, "slow.md");
    await slow.file.locator(".monaco-editor .view-lines").click();
    await page.keyboard.press("Control+End");
    await expect(slow.file.getByText(`Ln 1, Col ${SLOW.length + 1}`)).toBeVisible({ timeout: 2_000 });
    const typedAt = Date.now();
    await page.keyboard.type("z");
    await expect(slow.file.getByText(`Ln 1, Col ${SLOW.length + 2}`)).toBeVisible({ timeout: 2_000 });
    const typedMs = Date.now() - typedAt;
    await expect(slow.preview.getByText("This file takes more than 3 s to preview. The Code view still edits it.")).toBeVisible({ timeout: 15_000 });
    await expectQuietNode(page, nodeConsole, { bigChars: BIG.length, bigMs, bigTimings, deep1000Shown, typedMs });
  } finally {
    node.stop();
  }
});
