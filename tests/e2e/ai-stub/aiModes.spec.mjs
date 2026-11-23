// The assist modes in a browser (AM19): the menu, auto-applied writes with their Undo, and a
// tainted turn that stays a card. The service is the stub host of PLAYWRIGHT_AI_STUB, answered
// here; the flag is the `osio.ai.modes` localStorage key, which featureFlags reads.
// Caveat: no bridge runs, so the pages the assistant "wrote" are not on this side: the spec
// proves the UI and the requests (menu, rows, undo-writes, applied list), not the blocks on the
// server, which the service and bridge suites own.

import { expect, test } from "@playwright/test";

import { seedPages } from "../support/embedSeed.mjs";

// Every other AI spec runs with the service worker out of the way: it can hide requests from page.route.
test.use({ serviceWorkers: "block" });

const CHAT_KEY = "osionos.chat.v1";
const CONVERSATION_ID = "conv-modes";
const SERVER_ID = "11111111-1111-4111-8111-111111111111";
const RUN_ID = "22222222-2222-4222-8222-222222222222";
const TITLE = "Modes chat";
const PAGE_ID = "modes-page";
const BLOCKS = ["Alpha block", "Beta block", "Gamma block"].map((content, i) => ({ id: `b${i}`, type: "paragraph", content }));
const APPROVALS = ["a1", "a2", "a3"].map((id) => `${id}-33333333-3333-4333-8333-333333333333`);

const frame = (event, data) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
const applied = (id, n) => frame("write.applied", {
  approvalId: id, tool: "add_blocks", target: PAGE_ID, summary: `Added block ${n}`, decidedBy: "auto:accept_edits", undoable: true,
});
const streamOf = (frames) => [frame("run.started", { runId: RUN_ID }), ...frames, frame("done", {})].join("");

function seedChat() {
  const at = new Date().toISOString();
  return {
    conversations: [{ id: CONVERSATION_ID, projectId: null, title: TITLE, serverConversationId: SERVER_ID, createdAt: at, updatedAt: at }],
    messages: [],
  };
}

const appliedItems = (undone) => APPROVALS.map((approvalId, i) => ({
  approvalId, runId: RUN_ID, turnId: RUN_ID, tool: "add_blocks", target: PAGE_ID, summary: `Added block ${i + 1}`,
  decidedBy: "auto:accept_edits", decidedAt: new Date().toISOString(), undoneAt: undone ? new Date().toISOString() : null,
  undoable: !undone, undoUntil: new Date(Date.now() + 6 * 86_400_000).toISOString(),
}));

const undoReport = () => ({ ok: true, results: [...APPROVALS].reverse().map((approvalId) => ({ approvalId, tool: "add_blocks", ok: true })) });

/** The JSON bodies of the routes the menu and the rows read, by "METHOD path"; the run stream is answered apart. */
function jsonAnswers(state) {
  return {
    "GET /capabilities": () => ({}),
    [`GET /conversations/${SERVER_ID}/mode`]: () => ({ mode: "manual", anchorPageId: null }),
    [`PATCH /conversations/${SERVER_ID}/mode`]: () => ({ ok: true }),
    [`GET /conversations/${SERVER_ID}/applied`]: () => ({ items: state.undone ? appliedItems(true) : [] }),
    [`POST /runs/${RUN_ID}/undo-writes`]: () => { state.undone = true; return undoReport(); },
  };
}

/** Answers the AI host. `state.frames` is the next run's frames; `state.undone` flips with the undo. */
async function stubService(page, state) {
  const seen = [];
  const answers = jsonAnswers(state);
  await page.route("https://ai.invalid/**", (route) => {
    const request = route.request();
    const call = `${request.method()} ${new URL(request.url()).pathname.replace("/api/ai", "")}`;
    seen.push({ call, body: request.postData() });
    if (call === "POST /runs") return route.fulfill({ contentType: "text/event-stream", body: streamOf(state.frames) });
    if (answers[call]) return route.fulfill({ json: answers[call]() });
    return route.fulfill({ status: 404, json: { error: { code: "not_found" } } });
  });
  return seen;
}

async function openModesChat(page, baseURL, { flag = true } = {}) {
  await seedPages(page, [{ _id: PAGE_ID, title: "Modes page", content: BLOCKS }]);
  await page.addInitScript(([key, chat, on]) => {
    localStorage.setItem(key, JSON.stringify(chat));
    if (on) localStorage.setItem("osio.ai.modes", "1");
  }, [CHAT_KEY, seedChat(), flag]);
  await page.goto(baseURL, { waitUntil: "domcontentloaded" });
  await page.getByRole("tab", { name: /^Conversations/ }).click();
  await page.locator('[data-sidebar-panel="conversations"]').getByRole("button", { name: TITLE }).first().click();
}

const menu = (page) => page.getByLabel("Assistant mode").filter({ visible: true });

async function send(page, text) {
  const box = page.getByRole("textbox").filter({ visible: true }).last();
  await box.fill(text);
  await box.press("Enter");
}

test("the mode menu offers four modes and never bypass", async ({ page, baseURL }, testInfo) => {
  await stubService(page, { frames: [] });
  await openModesChat(page, baseURL);
  await expect(menu(page)).toBeEnabled();
  const options = await menu(page).locator("option").allTextContents();
  expect(options).toEqual(["Manual", "Plan", "Accept edits", "Auto"]);
  await expect(page.getByText(/bypass/i)).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("mode-menu.png") });
});

test("accept_edits applies three writes as rows, no card, and Undo all undoes the turn", async ({ page, baseURL }, testInfo) => {
  const state = { frames: APPROVALS.map((id, i) => applied(id, i + 1)) };
  const seen = await stubService(page, state);
  await openModesChat(page, baseURL);
  await expect(menu(page)).toBeEnabled();
  await menu(page).selectOption("accept_edits");
  await expect.poll(() => seen.filter((s) => s.call.startsWith("PATCH")).map((s) => JSON.parse(s.body).mode)).toEqual(["accept_edits"]);

  await send(page, "Add three blocks");
  const rows = page.getByTestId("chat-applied-write");
  await expect(rows).toHaveCount(3);
  await expect(rows.first()).toContainText("Applied automatically (accept edits)");
  await expect(rows.first()).toContainText("Undo is available for 7 days");
  await expect(page.getByTestId("chat-approval-card")).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("applied-rows.png") });

  await page.getByRole("button", { name: "Undo all" }).click();
  await expect(rows.locator("p", { hasText: /^Undone$/ })).toHaveCount(3);
  expect(seen.some((s) => s.call === `POST /runs/${RUN_ID}/undo-writes`)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("undone-rows.png") });

  // A reload reads the list back: the service says all three are undone.
  await page.reload({ waitUntil: "domcontentloaded" });
  // The Assistant tab comes back open: pick the conversation from its own history.
  await page.getByRole("navigation", { name: "Chat history" }).getByRole("button", { name: TITLE }).click();
  await expect(menu(page)).toBeEnabled();
  await expect(page.getByRole("button", { name: "Undo all" })).toHaveCount(0);
  await expect(page.getByTestId("chat-applied-write").filter({ visible: true })).toHaveCount(0);
  expect(seen.filter((s) => s.call === `GET /conversations/${SERVER_ID}/applied`).length).toBeGreaterThan(1);
});

test("a tainted turn stays a card and says why", async ({ page, baseURL }, testInfo) => {
  const asked = frame("permission.asked", {
    approvalId: "tainted-44444444-4444-4444-8444-444444444444", tool: "add_blocks", verb: "Add blocks",
    expiresAt: new Date(Date.now() + 600_000).toISOString(), cardReason: "tainted",
  });
  await stubService(page, { frames: [asked] });
  await openModesChat(page, baseURL);
  await expect(menu(page)).toBeEnabled();
  await send(page, "Summarise the shared page");
  const card = page.getByTestId("chat-approval-card");
  await expect(card).toBeVisible();
  await expect(card).toContainText("Automatic edits are off for this conversation: it read content other people can write.");
  await expect(page.getByTestId("chat-applied-write")).toHaveCount(0);
  await card.screenshot({ path: testInfo.outputPath("tainted-card.png") });
});
