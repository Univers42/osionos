// Shared by tests/e2e/functional/buttonProgram.spec.mjs (offline) and
// tests/e2e/bridge-stub/buttonProgramWrite.spec.mjs (stub bridge): the host page, its
// properties and the program/step builders.

import { explorerRow } from "../../browser/core/app.mjs";

export const WS = "mock-ws-private-0";
export const notify = (message) => ({ op: "action", action: { type: "notify", message } });
export const setProperty = (property, value) => ({ op: "action", action: { type: "set_property", property, value } });
export const program = (steps) => ({ version: 1, steps });
export const button = (extra) => ({ id: "b1", type: "button", content: "Run it", buttonLabel: "Run it", ...extra });

const PROPERTIES = [
  { key: "Base", label: "Base", type: "number", value: 41 },
  { key: "Owner", label: "Owner", type: "text", value: "dylan" },
  { key: "Done", label: "Done", type: "checkbox", value: false },
];

// Seeded once per tab (a reload must not undo what a persistence check reads).
export async function seed(page, baseURL, buttons) {
  await page.addInitScript(({ buttons, properties, ws }) => {
    if (sessionStorage.getItem("button-seeded") !== null) return;
    sessionStorage.setItem("button-seeded", "1");
    const base = { workspaceId: ws, ownerId: "mock-user-0", visibility: "private", collaborators: [], parentPageId: null, databaseId: null, archivedAt: null };
    localStorage.setItem(`osio:pages:${ws}`, JSON.stringify([
      { ...base, _id: "btn-host", title: "Button host", properties, content: buttons },
      { ...base, _id: "btn-target", title: "Button target", content: [] },
    ]));
    localStorage.setItem("pg:recents", "[]");
  }, { buttons, properties: PROPERTIES, ws: WS });
  await page.goto(baseURL, { waitUntil: "domcontentloaded" });
  await explorerRow(page, "Button host").click();
  await page.evaluate(() => globalThis.__playgroundUserStore.setState({ activePageJwt: () => "e2e-page-jwt" }));
}

export const cachedProperties = (page) =>
  page.evaluate((ws) => JSON.parse(localStorage.getItem(`osio:pages:${ws}`) ?? "[]").find((p) => p._id === "btn-host")?.properties, WS);
