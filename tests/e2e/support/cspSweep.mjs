/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   cspSweep.mjs                                       :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/* global document, localStorage, sessionStorage, window */

// What the CSP sweep (bridge-stub/cspSweep.spec.mjs) records and the world it runs in (#314).
// Caveat: a violation raised inside a worker never reaches the document listener; the engines show
// it only as a console message (Chromium "Refused to ...", Firefox "Content-Security-Policy: ..."),
// and what a worker's console reaches the page's depends on the engine. The sweep's worker control
// proves, per engine, that such a message is counted; where it is not, the sweep says SKIP.

import { WS } from "./buttonProgramSeed.mjs";
import { stubBridge } from "./bridgeStub.mjs";

export const CSP_CONSOLE = /Refused to|\[Report Only\]|Content[- ]Security[- ]Policy/i;
// Firefox and WebKit print this notice per document because the policy has no report endpoint
// (#314 Q1: no sink on purpose). It is not a violation; the control still proves real ones are counted.
const NO_SINK_NOTICE = /without a report-uri directive nor a report-to directive|delivered in report-only mode, but does not specify a 'report/;

/** Records every securitypolicyviolation of every frame (before any page script) and every console
 *  message that reads like one. `report()` returns both. */
export async function recordCsp(page) {
  const consoleHits = [];
  page.on("console", (message) => {
    if (CSP_CONSOLE.test(message.text()) && !NO_SINK_NOTICE.test(message.text())) consoleHits.push(`${message.type()}: ${message.text().slice(0, 300)}`);
  });
  await page.addInitScript(() => {
    const events = [];
    document.addEventListener("securitypolicyviolation", (event) => {
      events.push(`${event.disposition} ${event.violatedDirective} ${event.blockedURI} ${event.sourceFile || ""}`.trim());
    }, true);
    Object.defineProperty(window, "__cspEvents", { value: events });
  });
  return {
    async report() {
      const events = [];
      for (const frame of page.frames()) {
        events.push(...(await frame.evaluate(() => window.__cspEvents ?? []).catch(() => [])));
      }
      return { events, consoleHits: [...consoleHits] };
    },
  };
}

/** Both negative controls, in a throwaway context (a shared one leaked the control's eval into the surface page's events), so each sweep test proves for
 *  itself (not through state a restarted worker would lose) that this engine counts what it must.
 *  Counted = more events (console lines) after the injection than the bare page loaded with. */
export async function countControls(browser, baseURL, viewport) {
  const context = await browser.newContext({ viewport, serviceWorkers: "block" });
  const page = await context.newPage();
  const csp = await recordCsp(page);
  await page.goto(baseURL, { waitUntil: "load" });
  const before = await csp.report();
  await page.evaluate(() => {
    const script = document.createElement("script");
    script.textContent = "window.__injected = 1";
    document.head.append(script);
  });
  const inline = await settles(async () => (await csp.report()).events.length > before.events.length);
  await page.evaluate(() => {
    const source = 'try { eval("1") } catch (error) {} self.postMessage("ran")';
    const worker = new Worker(URL.createObjectURL(new Blob([source], { type: "text/javascript" })));
    window.__controlWorker = new Promise((resolve) => { worker.onmessage = () => resolve("ran"); worker.onerror = () => resolve("error"); });
  });
  await page.evaluate(() => window.__controlWorker);
  const worker = await settles(async () => (await csp.report()).consoleHits.length > before.consoleHits.length);
  await context.close();
  return { inline, worker };
}

async function settles(condition, timeoutMs = 5_000) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    if (await condition()) return true;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return false;
}

const CORS = (request) => ({
  "access-control-allow-origin": request.headers().origin ?? "*",
  "access-control-allow-credentials": "true",
  "access-control-allow-headers": "*",
  "access-control-allow-methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
});

/** Nothing leaves the machine: the bridge answers `{}` (or what `respond` says), every other
 *  origin answers 204, and a WebSocket is held open and silent. */
export async function stubWorld(page, baseURL, respond = () => undefined) {
  const own = new URL(baseURL).origin;
  await page.routeWebSocket(() => true, () => {});
  await page.route((url) => url.origin !== own, (route) => route.fulfill({ status: 204, headers: CORS(route.request()) }));
  await stubBridge(page, (url, request) => respond(url, request) ?? { json: {} });
}

/** Local pages of the mock workspace, written once per tab (a reload must not undo an edit). */
export async function seedLocalPages(page, pages) {
  await page.addInitScript(({ pages, ws }) => {
    if (sessionStorage.getItem("csp-seeded") !== null) return;
    sessionStorage.setItem("csp-seeded", "1");
    localStorage.setItem(`osio:pages:${ws}`, JSON.stringify(pages.map((entry) => ({
      workspaceId: ws, ownerId: "mock-user-0", visibility: "private", collaborators: [],
      parentPageId: null, databaseId: null, archivedAt: null, ...entry,
    }))));
    localStorage.setItem("pg:recents", "[]");
  }, { pages, ws: WS });
}
