/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   accountExport.spec.mjs                             :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/23 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/23 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Settings > Preferences > Privacy export panel, and the deletion grace block, against a
// stubbed bridge (PLAYWRIGHT_BRIDGE_STUB=1; the default offline build has no bridge, so
// every assertion here would pass vacuously). Download is a binary answer, which the JSON
// stub cannot give, so this spec adds its own route on top of it.

import { expect, test } from "@playwright/test";

import { enableAccountDelete } from "../support/accountDelete.mjs";
import { BRIDGE_STUB_ORIGIN, stubBridge } from "../support/bridgeStub.mjs";
import { closeSettings, openSettings, region } from "../support/settingsHelpers.mjs";

const job = (id, status, extra = {}) => ({
  id, format: "zip", status, requestedAt: "2026-10-23T08:00:00.000Z", finishedAt: null,
  expiresAt: null, bytes: null, errorCode: null, ...extra,
});
const DONE = job("11111111-1111-4111-8111-111111111111", "done", { expiresAt: "2026-10-30T08:00:00.000Z", bytes: 1200 });
const QUEUED = job("22222222-2222-4222-8222-222222222222", "queued");
const FAILED = job("33333333-3333-4333-8333-333333333333", "failed", { errorCode: "export_too_large" });
const EXPIRED = job("44444444-4444-4444-8444-444444444444", "expired");

const exportPanel = (page) => region(page).getByTestId("account-export");

async function stubAccount(page, state) {
  await stubBridge(page, (url, request) => {
    // 404 reads as "not served yet" to the preferences store, which then falls back to its defaults.
    if (url.pathname === "/api/preferences") return { status: 404, json: { code: "not_found" } };
    if (url.pathname === "/api/account/export" && request.method() === "GET") return state.list ?? { json: { exports: state.jobs } };
    if (url.pathname === "/api/account/export" && request.method() === "POST") {
      state.posts.push(request.postDataJSON());
      return state.post ?? { status: 202, json: { id: QUEUED.id, status: "queued" } };
    }
    if (url.pathname === "/api/account/deletion" && request.method() === "GET") return state.deletion ?? { status: 404, json: { code: "deletion_not_found" } };
    if (url.pathname === "/api/account/deletion" && request.method() === "DELETE") return state.cancel;
    return undefined;
  });
}

async function stubDownload(page, answer) {
  await page.route(`${BRIDGE_STUB_ORIGIN}/api/account/export/*/download`, (route) => {
    const origin = route.request().headers().origin ?? "*";
    const headers = { "access-control-allow-origin": origin, "access-control-allow-credentials": "true", "access-control-allow-headers": "*" };
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers });
    return route.fulfill({ ...answer, headers: { ...headers, ...answer.headers } });
  });
}

async function openPrivacy(page, baseURL) {
  await page.goto(baseURL, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => globalThis.__playgroundUserStore.setState({ activePageJwt: () => "e2e-page-jwt" }));
  await openSettings(page, "Preferences");
}

test.describe("account export panel", () => {
  test("an account with no export shows the empty state", async ({ page, baseURL }) => {
    await stubAccount(page, { jobs: [], posts: [] });
    await openPrivacy(page, baseURL);
    await expect(exportPanel(page).getByText("No exports yet.", { exact: false })).toBeVisible();
    await expect(exportPanel(page).getByRole("button", { name: /^Download/ })).toHaveCount(0);
  });

  test("a slow list shows the loading skeleton before the rows", async ({ page, baseURL }) => {
    await stubAccount(page, { jobs: [DONE], posts: [] });
    await page.route(`${BRIDGE_STUB_ORIGIN}/api/account/export`, async (route) => {
      if (route.request().method() !== "GET") return route.fallback();
      await new Promise((resolve) => setTimeout(resolve, 1500));
      return route.fallback();
    });
    await openPrivacy(page, baseURL);
    await expect(exportPanel(page).getByText("No exports yet.", { exact: false })).toHaveCount(0);
    await expect(exportPanel(page).getByText("Ready", { exact: false })).toHaveCount(0);
    await expect(exportPanel(page).getByText("Ready", { exact: false })).toBeVisible();
  });

  test("a failed list says so and Retry recovers", async ({ page, baseURL }) => {
    const state = { jobs: [DONE], posts: [], list: { status: 500, json: { code: "server_error", message: "The export list is down." } } };
    await stubAccount(page, state);
    await openPrivacy(page, baseURL);
    await expect(exportPanel(page).getByRole("alert")).toContainText("The export list is down.");
    state.list = null;
    await exportPanel(page).getByRole("button", { name: "Retry" }).click();
    await expect(exportPanel(page).getByRole("button", { name: "Download ZIP export" })).toBeVisible();
  });

  test("only a done job offers Download, and it shows when the link expires", async ({ page, baseURL }) => {
    await stubAccount(page, { jobs: [DONE, QUEUED, FAILED, EXPIRED], posts: [] });
    await openPrivacy(page, baseURL);
    await expect(exportPanel(page).getByRole("button", { name: /^Download/ })).toHaveCount(1);
    await expect(exportPanel(page).getByText("Link expires on October 30, 2026.")).toBeVisible();
    await expect(exportPanel(page).getByText("Waiting to start")).toBeVisible();
    await expect(exportPanel(page).getByText("Could not be built")).toBeVisible();
    await expect(exportPanel(page).getByText("export · Expired")).toBeVisible();
  });

  test("Download saves the file the bridge sent, with the session token", async ({ page, baseURL }) => {
    await stubAccount(page, { jobs: [DONE], posts: [] });
    let auth = null;
    await stubDownload(page, { status: 200, contentType: "application/zip", body: "PK-e2e" });
    page.on("request", (request) => { if (request.url().endsWith("/download")) auth = request.headers().authorization; });
    await openPrivacy(page, baseURL);
    const saved = page.waitForEvent("download");
    await exportPanel(page).getByRole("button", { name: "Download ZIP export" }).click();
    expect((await saved).suggestedFilename()).toBe("osionos-export.zip");
    expect(auth).toBe("Bearer e2e-page-jwt");
  });

  test("a 410 says the export expired and saves nothing", async ({ page, baseURL }) => {
    await stubAccount(page, { jobs: [DONE], posts: [] });
    await stubDownload(page, { status: 410, contentType: "application/json", body: JSON.stringify({ code: "export_expired", message: "gone" }) });
    let downloaded = false;
    page.on("download", () => { downloaded = true; });
    await openPrivacy(page, baseURL);
    await exportPanel(page).getByRole("button", { name: "Download ZIP export" }).click();
    await expect(page.getByText("This export expired; request a new one")).toBeVisible();
    expect(downloaded).toBe(false);
  });

  test("Request export sends the chosen format", async ({ page, baseURL }) => {
    const state = { jobs: [], posts: [] };
    await stubAccount(page, state);
    await openPrivacy(page, baseURL);
    await exportPanel(page).getByRole("button", { name: "Request export" }).click();
    await expect.poll(() => state.posts).toEqual([{ format: "zip" }]);
  });

  test("a request that needs sudo opens the one sudo prompt", async ({ page, baseURL }) => {
    await stubAccount(page, { jobs: [], posts: [], post: { status: 403, json: { code: "sudo_required" } } });
    await openPrivacy(page, baseURL);
    await exportPanel(page).getByRole("button", { name: "Request export" }).click();
    await expect(page.getByRole("dialog", { name: "Confirm it's you" })).toBeVisible();
  });
});

test.describe("deletion grace block", () => {
  const GRACE = { requestedAt: "2026-10-23T08:00:00.000Z", scheduledFor: "2026-11-06T08:00:00.000Z" };

  async function openProfile(page, baseURL) {
    await enableAccountDelete(page);
    await page.goto(baseURL, { waitUntil: "domcontentloaded" });
    await page.evaluate(() => globalThis.__playgroundUserStore.setState({ activePageJwt: () => "e2e-page-jwt" }));
    await openSettings(page);
  }

  test("a scheduled deletion shows Cancel", async ({ page, baseURL }) => {
    await stubAccount(page, { jobs: [], posts: [], deletion: { json: { ...GRACE, inProgress: false } } });
    await openProfile(page, baseURL);
    await expect(region(page).getByRole("button", { name: "Cancel deletion" })).toBeVisible();
    await expect(region(page).getByText("Deletion is running")).toHaveCount(0);
    await closeSettings(page);
  });

  test("a running deletion shows the state and no Cancel", async ({ page, baseURL }) => {
    await stubAccount(page, { jobs: [], posts: [], deletion: { json: { ...GRACE, inProgress: true } } });
    await openProfile(page, baseURL);
    await expect(region(page).getByText("Deletion is running")).toBeVisible();
    await expect(region(page).getByRole("button", { name: "Cancel deletion" })).toHaveCount(0);
  });

  test("a Cancel the bridge refuses with deletion_in_progress flips to the running state", async ({ page, baseURL }) => {
    await stubAccount(page, {
      jobs: [], posts: [], deletion: { json: { ...GRACE, inProgress: false } },
      cancel: { status: 409, json: { code: "deletion_in_progress", message: "running" } },
    });
    await openProfile(page, baseURL);
    await region(page).getByRole("button", { name: "Cancel deletion" }).click();
    await expect(region(page).getByText("Deletion is running")).toBeVisible();
    await expect(region(page).getByRole("button", { name: "Cancel deletion" })).toHaveCount(0);
  });

  test("with the flag off there is no delete row", async ({ page, baseURL }) => {
    await stubAccount(page, { jobs: [], posts: [] });
    await page.goto(`${baseURL}?osio.account.delete=0`, { waitUntil: "domcontentloaded" });
    await page.evaluate(() => globalThis.__playgroundUserStore.setState({ activePageJwt: () => "e2e-page-jwt" }));
    await openSettings(page);
    await expect(region(page).getByRole("button", { name: "Delete my account", exact: true })).toHaveCount(0);
  });
});
