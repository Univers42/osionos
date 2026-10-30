/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   notificationsInbox.spec.mjs                        :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/30 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/30 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// #174: notifications were stored and toasted, but no screen listed them, so one
// could not be read on its own, deleted or cleared. The rail's Notifications panel
// is the inbox. Runs against a stubbed bridge (PLAYWRIGHT_BRIDGE_STUB=1) whose
// table the test reads back; tests/bridge/bridge-notify-inbox.test.mjs is the other end.

import { expect, test } from "@playwright/test";

import { stubBridge } from "../support/bridgeStub.mjs";

const id = (n) => `${String(n).padStart(8, "0")}-0000-4000-8000-000000000000`;
const ago = (minutes) => new Date(Date.now() - minutes * 60_000).toISOString();

function seededRows() {
  return [
    { id: id(1), type: "mention", actorId: null, channelId: "c1", messageId: "m1", preview: "Can you review the roadmap?", readAt: null, createdAt: ago(5) },
    { id: id(2), type: "page_comment", actorId: null, channelId: "p1", messageId: null, preview: "Looks good to me", readAt: null, createdAt: ago(60) },
    { id: id(3), type: "task_due", actorId: null, channelId: null, messageId: null, preview: "Ship the release notes", readAt: ago(30), createdAt: ago(60 * 24) },
  ];
}

/** The bridge's notification table, the calls it took, and an optional refused method. */
async function stubInbox(page, { refuse = null } = {}) {
  const rows = seededRows();
  const calls = [];
  await stubBridge(page, (url, request) => {
    const method = request.method();
    if (!url.pathname.startsWith("/api/notifications")) return undefined;
    calls.push(`${method} ${url.pathname}`);
    if (method === refuse) return { status: 503, json: { ok: false, message: "The notification store is unavailable." } };
    if (url.pathname === "/api/notifications/inbox") return { json: { ok: true, notifyToken: null, unread: rows.filter((row) => !row.readAt).length } };
    if (url.pathname === "/api/notifications" && method === "GET") return { json: { ok: true, items: rows } };
    if (url.pathname === "/api/notifications/read") {
      const ids = request.postDataJSON().ids;
      for (const row of rows) if (ids.includes(row.id)) row.readAt ??= new Date().toISOString();
      return { json: { ok: true } };
    }
    if (url.pathname === "/api/notifications/read-all") {
      for (const row of rows) row.readAt ??= new Date().toISOString();
      return { json: { ok: true } };
    }
    if (method === "DELETE") {
      const one = url.pathname.split("/")[3];
      rows.splice(0, rows.length, ...rows.filter((row) => one !== undefined && row.id !== one));
      return { json: { ok: true } };
    }
    return undefined;
  });
  return { rows, calls };
}

async function openInbox(page, baseURL) {
  await page.goto(baseURL, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => globalThis.__playgroundUserStore.setState({ activePageJwt: () => "e2e-page-jwt" }));
  await page.getByRole("tab", { name: /^Notifications/ }).click();
  const inbox = page.getByRole("region", { name: "Inbox" });
  await expect(inbox.getByRole("listitem")).toHaveCount(3);
  return inbox;
}

const row = (inbox, text) => inbox.getByRole("listitem").filter({ hasText: text });

test.describe("the notification inbox", () => {
  test("lists the stored notifications: what each is, when, and which are unread", async ({ page, baseURL }) => {
    await stubInbox(page);
    const inbox = await openInbox(page, baseURL);

    await expect(row(inbox, "Can you review the roadmap?")).toContainText("Mention");
    await expect(row(inbox, "Can you review the roadmap?")).toContainText("5m ago");
    await expect(row(inbox, "Can you review the roadmap?")).toContainText("Unread");
    await expect(row(inbox, "Looks good to me")).toContainText("Comment on your page");
    await expect(row(inbox, "Ship the release notes")).toContainText("Task due");
    await expect(row(inbox, "Ship the release notes")).not.toContainText("Unread");
    await expect(page.getByRole("tab", { name: "Notifications (2 new)" })).toBeVisible();
  });

  test("marks one notification read at the bridge", async ({ page, baseURL }) => {
    const { rows } = await stubInbox(page);
    const inbox = await openInbox(page, baseURL);

    await row(inbox, "Can you review the roadmap?").getByRole("button", { name: "Mark as read" }).click();

    await expect(row(inbox, "Can you review the roadmap?")).not.toContainText("Unread");
    await expect(row(inbox, "Can you review the roadmap?").getByRole("button", { name: "Mark as read" })).toHaveCount(0);
    await expect(page.getByRole("tab", { name: "Notifications (1 new)" })).toBeVisible();
    await expect.poll(() => rows.find((entry) => entry.id === id(1)).readAt).not.toBeNull();
    expect(rows.find((entry) => entry.id === id(2)).readAt).toBeNull();
  });

  test("deletes one notification at the bridge", async ({ page, baseURL }) => {
    const { rows, calls } = await stubInbox(page);
    const inbox = await openInbox(page, baseURL);

    await row(inbox, "Looks good to me").getByRole("button", { name: "Delete notification" }).click();

    await expect(inbox.getByRole("listitem")).toHaveCount(2);
    await expect(row(inbox, "Looks good to me")).toHaveCount(0);
    await expect.poll(() => calls).toContain(`DELETE /api/notifications/${id(2)}`);
    expect(rows.map((entry) => entry.id)).toEqual([id(1), id(3)]);
    await expect(page.getByRole("tab", { name: "Notifications (1 new)" })).toBeVisible();
  });

  test("marks all read, then clears the inbox", async ({ page, baseURL }) => {
    const { rows, calls } = await stubInbox(page);
    const inbox = await openInbox(page, baseURL);

    await inbox.getByRole("button", { name: "Mark all read" }).click();
    await expect(inbox).not.toContainText("Unread");
    await expect(page.getByRole("tab", { name: "Notifications", exact: true })).toBeVisible();
    await expect.poll(() => calls).toContain("POST /api/notifications/read-all");

    await inbox.getByRole("button", { name: "Clear all" }).click();
    await expect(inbox.getByRole("listitem")).toHaveCount(0);
    await expect(page.getByText("You're all caught up.")).toBeVisible();
    await expect.poll(() => rows.length).toBe(0);
  });

  test("a delete the bridge refuses puts the notification back and says why", async ({ page, baseURL }) => {
    await stubInbox(page, { refuse: "DELETE" });
    const inbox = await openInbox(page, baseURL);

    await row(inbox, "Looks good to me").getByRole("button", { name: "Delete notification" }).click();

    await expect(page.getByText("The notification could not be deleted.")).toBeVisible();
    await expect(page.getByText("The notification store is unavailable.")).toBeVisible();
    await expect(inbox.getByRole("listitem")).toHaveCount(3);
    await expect(row(inbox, "Looks good to me")).toBeVisible();
  });
});
