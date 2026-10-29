/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   settingsSshKeys.spec.mjs                           :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/23 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/23 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Settings > Developer > SSH and GPG keys against a stubbed bridge (PLAYWRIGHT_BRIDGE_STUB=1):
// list, add (the fingerprint shows), delete behind an in-app confirmation, the refusal of a
// private key, and a pasted key leaving the DOM when the dialog closes.

import { test, expect } from "@playwright/test";

import { stubBridge } from "../support/bridgeStub.mjs";
import { region } from "../support/settingsHelpers.mjs";
import { openDeveloper } from "../support/tokensStub.mjs";

const PUBLIC = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOMqqnkVzrm0SdG6UOoqKLsabgH5C9okWi0dh2l9GKJl laptop";
const PRIVATE = "-----BEGIN OPENSSH PRIVATE KEY-----\nb3BlbnNzaC1rZXktdjEAAAAA\n-----END OPENSSH PRIVATE KEY-----";
const FINGERPRINT = "SHA256:E2eFingerprintFixtureNotAsshKeygenValue00000";
const KEY_ID = "00000000-0000-4000-8000-0000000000bb";

const section = (page) => region(page).locator('[data-settings-anchor="ssh-gpg-keys"]');

/** Fake /api/account/keys with in-memory rows; `answerPost` overrides the POST answer. */
async function stubKeys(page, rows = []) {
  const state = { rows: [...rows], posts: [], deletes: [], answerPost: null };
  await stubBridge(page, (url, request) => {
    const [, id] = url.pathname.match(/^\/api\/account\/keys(?:\/([^/]+))?$/) ?? [];
    if (!url.pathname.startsWith("/api/account/keys")) return undefined;
    if (request.method() === "GET") return { json: { ok: true, keys: state.rows } };
    if (request.method() === "POST") {
      const body = request.postDataJSON();
      state.posts.push(body);
      if (state.answerPost) return state.answerPost;
      const key = { id: KEY_ID, kind: body.kind, title: body.title, fingerprint: FINGERPRINT, keyType: "ssh-ed25519", createdAt: "2026-10-23T10:00:00.000Z" };
      state.rows.unshift(key);
      return { status: 201, json: { ok: true, key } };
    }
    if (request.method() === "DELETE") {
      state.deletes.push(id);
      state.rows = state.rows.filter((row) => row.id !== id);
      return { status: 204 };
    }
    return undefined;
  });
  return state;
}

async function openAddDialog(page) {
  await section(page).getByRole("button", { name: "Add key" }).click();
  return page.getByRole("dialog", { name: "Add a public key" });
}

test.describe("settings SSH and GPG keys", () => {
  test("an account with no keys shows the empty state", async ({ page, baseURL }) => {
    await stubKeys(page);
    await openDeveloper(page, baseURL);
    await expect(section(page).getByText("No SSH or GPG keys yet.")).toBeVisible();
  });

  test("add shows the fingerprint, sends only kind, title and the trimmed key; delete asks first", async ({ page, baseURL }) => {
    const bridge = await stubKeys(page);
    await openDeveloper(page, baseURL);
    const dialog = await openAddDialog(page);
    const add = dialog.getByRole("button", { name: "Add key" });
    await expect(add).toBeDisabled();
    await dialog.getByLabel("Title").fill("Work laptop");
    await dialog.getByLabel("Public key").fill(`  ${PUBLIC}\n`);
    await add.click();
    await expect(dialog).toHaveCount(0);
    await expect(section(page).getByText(FINGERPRINT)).toBeVisible();
    expect(bridge.posts).toEqual([{ kind: "ssh", title: "Work laptop", publicKey: PUBLIC }]);

    await section(page).getByRole("button", { name: "Delete Work laptop" }).click();
    await page.getByRole("button", { name: "Cancel" }).click();
    expect(bridge.deletes).toEqual([]);
    await section(page).getByRole("button", { name: "Delete Work laptop" }).click();
    await page.getByRole("dialog", { name: "Delete key" }).getByRole("button", { name: "Delete", exact: true }).click();
    await expect(section(page).getByText(FINGERPRINT)).toHaveCount(0);
    expect(bridge.deletes).toEqual([KEY_ID]);
  });

  test("a private key paste is refused before it is sent, and nothing stays in the DOM after close", async ({ page, baseURL }) => {
    const bridge = await stubKeys(page);
    await openDeveloper(page, baseURL);
    const dialog = await openAddDialog(page);
    await dialog.getByLabel("Title").fill("Oops");
    await dialog.getByLabel("Public key").fill(PRIVATE);
    await expect(dialog.getByRole("alert")).toContainText("private key");
    await expect(dialog.getByRole("button", { name: "Add key" })).toBeDisabled();
    expect(bridge.posts).toEqual([]);
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByRole("dialog", { name: "Add a public key" })).toHaveCount(0);
    expect(await page.evaluate(() => document.body.innerHTML.includes("OPENSSH PRIVATE KEY"))).toBe(false);
    const reopened = await openAddDialog(page);
    await expect(reopened.getByLabel("Public key")).toHaveValue("");
  });

  test("the bridge's refusal is shown in words and keeps the dialog open", async ({ page, baseURL }) => {
    const bridge = await stubKeys(page);
    bridge.answerPost = { status: 400, json: { ok: false, code: "private_key_refused", message: "x" } };
    await openDeveloper(page, baseURL);
    const dialog = await openAddDialog(page);
    await dialog.getByLabel("Title").fill("Odd");
    await dialog.getByLabel("Public key").fill(PUBLIC);
    await dialog.getByRole("button", { name: "Add key" }).click();
    await expect(dialog.getByRole("alert")).toContainText("Paste the public key instead");
    await expect(dialog).toBeVisible();
  });
});
