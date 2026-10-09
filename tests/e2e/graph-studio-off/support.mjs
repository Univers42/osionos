// A stand-in for graph_render's <graph-studio> pack, so the gate-off build's graph host
// can be driven without the real pack (groot serves that, and checks the real element in
// its own CI). It keeps the parts of the host contract the host relies on: the element is
// defined only by defineGraphStudio(), reads `wasm` once when it connects, rejects a
// refused load AND fires graph-error, and dispatches bubbling, composed events.

import { expect } from "@playwright/test";

export const BASE = "/graph-studio/stub/";
export const VIEW = '[data-testid="graph-studio-view"]';

const STUB_MODULE = `
const cfg = globalThis.__gsStub ?? {};
export const HOST_API = cfg.moduleHostApi ?? 2;
export function defineGraphStudio() {
  if (customElements.get("graph-studio")) return;
  const log = (globalThis.__gsLog ??= { connects: [], loads: [], focuses: [] });
  class GraphStudio extends HTMLElement {
    get hostApi() { return cfg.elementHostApi ?? 2; }
    connectedCallback() {
      this.__connects = (this.__connects ?? 0) + 1;
      log.connects.push({ wasm: this.getAttribute("wasm"), remember: this.hasAttribute("remember"), times: this.__connects });
    }
    async loadGraph(doc) {
      log.loads.push(doc);
      if (cfg.refuse) {
        const message = 'osionos: duplicate node id "x"';
        this.dispatchEvent(new CustomEvent("graph-error", { bubbles: true, composed: true, detail: { error: "IngestRefusal", message } }));
        const error = new Error(message);
        error.name = "IngestRefusal";
        throw error;
      }
      const result = { nodes: doc.nodes.length, edges: doc.edges.length, notes: [] };
      this.dispatchEvent(new CustomEvent("graph-load", { bubbles: true, composed: true, detail: result }));
      return result;
    }
    async focusNode(id) { log.focuses.push(id); return true; }
    async selectNodes() { return true; }
    get selectedIds() { return []; }
    invalidate() {}
  }
  customElements.define("graph-studio", GraphStudio);
}
`;

/**
 * Serves the stub pack under BASE and, unless `meta:false`, names it in
 * <meta name="graph-studio-base"> as groot's image does. Collects console warnings.
 */
export async function installStub(page, { meta = true, abi = 2, ...cfg } = {}) {
  await page.route(`**${BASE}graph-studio.js`, (route) =>
    route.fulfill({ status: 200, contentType: "text/javascript", body: STUB_MODULE }),
  );
  await page.route(`**${BASE}pack.json`, (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ name: "stub", abi_version: abi }) }),
  );
  await page.addInitScript(
    ({ base, meta: withMeta, stub }) => {
      globalThis.__gsStub = stub;
      if (!withMeta) return;
      const add = () => {
        const tag = document.createElement("meta");
        tag.name = "graph-studio-base";
        tag.content = base;
        document.head.append(tag);
      };
      if (document.head) add();
      else document.addEventListener("DOMContentLoaded", add, { once: true });
    },
    { base: BASE, meta, stub: cfg },
  );
  const warnings = [];
  page.on("console", (msg) => {
    if (msg.type() === "warning" && msg.text().includes("[graph-studio]")) warnings.push(msg.text());
  });
  return { warnings };
}

export function stubLog(page) {
  return page.evaluate(() => globalThis.__gsLog ?? { connects: [], loads: [], focuses: [] });
}

/** The new graph is on screen, sized, and has loaded through the element. */
export async function expectNewGraph(view) {
  await expect(view).toBeVisible({ timeout: 20_000 });
  await expect(view).toHaveAttribute("data-graph-state", "ready", { timeout: 20_000 });
  await expect(view.locator("graph-studio")).toHaveCount(1);
  const box = await view.locator("graph-studio").boundingBox();
  expect(box?.width ?? 0).toBeGreaterThan(0);
  expect(box?.height ?? 0).toBeGreaterThan(0);
}
