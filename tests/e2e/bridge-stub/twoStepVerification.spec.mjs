/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   twoStepVerification.spec.mjs       :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/23 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/23 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// P3-2-c against a stubbed bridge (PLAYWRIGHT_BRIDGE_STUB=1): the Two-step verification modal
// shows what the status route says, enrols only when the button is pressed, shows the recovery
// codes once, orders its options by the preferred method, and the Passkeys modal manages
// (rename, remove) without an Add control.

import { test, expect } from "@playwright/test";

import { region } from "../support/settingsHelpers.mjs";
import { openProfile } from "../support/sessionsStub.mjs";
import { NEW_REFRESH, NEW_TOKEN, OTPAUTH, RECOVERY_CODES, passkeyRow, stubTwoStep } from "../support/twoStepStub.mjs";

const dialog = (page) => page.getByRole("dialog", { name: "Two-step verification" });
const openModal = (page, name) => region(page).getByRole("button", { name, exact: true }).click();

test.describe("Two-step verification modal (bridge stub)", () => {
  test("opening the modal does not enrol: no call, no QR, until the button is pressed", async ({ page, baseURL }) => {
    const bridge = await stubTwoStep(page);
    await openProfile(page, baseURL);
    await openModal(page, "Add verification method");
    await expect(dialog(page).getByRole("button", { name: "Set up authenticator app" })).toBeVisible();
    await expect(dialog(page).locator("img")).toHaveCount(0);
    expect(bridge.calls.filter((call) => call.includes("/enroll"))).toEqual([]);
    await dialog(page).getByRole("button", { name: "Set up authenticator app" }).click();
    await expect(dialog(page).getByRole("img", { name: "Two-step verification QR code" })).toBeVisible();
    expect(bridge.calls.filter((call) => call.includes("/enroll"))).toEqual(["POST /api/account/2fa/enroll"]);
    expect(OTPAUTH).toContain("otpauth://");
  });

  test("a verified code creates recovery codes, shown once", async ({ page, baseURL }) => {
    const bridge = await stubTwoStep(page);
    await openProfile(page, baseURL);
    await openModal(page, "Add verification method");
    await dialog(page).getByRole("button", { name: "Set up authenticator app" }).click();
    await dialog(page).getByLabel("6-digit code").fill("123456");
    await dialog(page).getByRole("button", { name: "Verify", exact: true }).click();
    const list = dialog(page).getByRole("list", { name: "Recovery codes" });
    for (const code of RECOVERY_CODES) await expect(list).toContainText(code);
    expect(bridge.bodies.verify).toEqual({ code: "123456" });
    const order = bridge.calls.filter((call) => /verify|generate/.test(call));
    expect(order).toEqual(["POST /api/account/2fa/verify", "POST /api/account/2fa/recovery/generate"]);
    await dialog(page).getByRole("button", { name: "I saved these codes" }).click();
    await expect(dialog(page)).toHaveCount(0);
    await openModal(page, "Manage");
    await expect(dialog(page).getByText(RECOVERY_CODES[0])).toHaveCount(0);
    await expect(dialog(page)).toContainText("Two-step verification is on");
  });

  /** Seeds a saved bridge record holding the OLD pair, as a reload would find it. */
  async function seedSavedPair(page, baseURL) {
    await openProfile(page, baseURL, { bridgeToken: "osionos_v1.e2e-old.sig" });
    return page.evaluate(() => {
      const { activeUserId, sessions } = globalThis.__playgroundUserStore.getState();
      const session = { ...sessions[activeUserId], refreshToken: "osb_rt.e2e-old.sig" };
      globalThis.__playgroundUserStore.setState({ sessions: { ...sessions, [activeUserId]: session } });
      const record = { session, persona: { id: activeUserId }, expiresAt: "2099-01-01T00:00:00.000Z" };
      localStorage.setItem("osionos:bridge-session", JSON.stringify({ [activeUserId]: record }));
      return activeUserId;
    });
  }
  const readPair = (page, id) => page.evaluate((userId) => {
    const pick = (session) => ({ accessToken: session?.accessToken, refreshToken: session?.refreshToken });
    return { saved: pick(JSON.parse(localStorage.getItem("osionos:bridge-session") ?? "{}")[userId]?.session), live: pick(globalThis.__playgroundUserStore.getState().sessions[userId]) };
  }, id);
  const NEW_PAIR = { accessToken: NEW_TOKEN, refreshToken: NEW_REFRESH };

  test("E1: the pair a verify returns replaces the saved one, so a reload keeps the new family", async ({ page, baseURL }) => {
    await stubTwoStep(page);
    const userId = await seedSavedPair(page, baseURL);
    await openModal(page, "Add verification method");
    await dialog(page).getByRole("button", { name: "Set up authenticator app" }).click();
    await dialog(page).getByLabel("6-digit code").fill("123456");
    await dialog(page).getByRole("button", { name: "Verify", exact: true }).click();
    await expect(dialog(page).getByRole("list", { name: "Recovery codes" })).toBeVisible();
    expect(await readPair(page, userId)).toEqual({ saved: NEW_PAIR, live: NEW_PAIR });
  });

  test("E2: Turn off adopts the pair the disable returned", async ({ page, baseURL }) => {
    await stubTwoStep(page, { enabled: true, recoveryRemaining: 4 });
    const userId = await seedSavedPair(page, baseURL);
    await openModal(page, "Manage");
    await dialog(page).getByRole("button", { name: "Turn off" }).click();
    await expect(region(page).getByRole("button", { name: "Add verification method", exact: true })).toBeVisible();
    expect(await readPair(page, userId)).toEqual({ saved: NEW_PAIR, live: NEW_PAIR });
  });

  test("E3: a 503 session_record_unavailable on confirm drops the local session without a logout call", async ({ page, baseURL }) => {
    await stubTwoStep(page, { sessionRecordDown: true });
    const userId = await seedSavedPair(page, baseURL);
    const logouts = [];
    page.on("request", (request) => { if (/logout/.test(request.url())) logouts.push(request.url()); });
    await openModal(page, "Add verification method");
    await dialog(page).getByRole("button", { name: "Set up authenticator app" }).click();
    await dialog(page).getByLabel("6-digit code").fill("123456");
    await dialog(page).getByRole("button", { name: "Verify", exact: true }).click();
    await expect.poll(() => page.evaluate((id) => globalThis.__playgroundUserStore.getState().sessions[id], userId)).toBeUndefined();
    expect(await page.evaluate((id) => JSON.parse(localStorage.getItem("osionos:bridge-session") ?? "{}")[id], userId)).toBeUndefined();
    expect(logouts).toEqual([]);
  });

  test("the preferred method orders the options", async ({ page, baseURL }) => {
    const bridge = await stubTwoStep(page, { enabled: true, recoveryRemaining: 4 });
    await openProfile(page, baseURL);
    await openModal(page, "Manage");
    const methods = dialog(page).getByRole("list", { name: "Verification methods" }).getByRole("listitem");
    await expect(methods.first()).toContainText("Authenticator app (preferred)");
    await methods.nth(1).getByRole("button", { name: "Make preferred" }).click();
    await expect(methods.first()).toContainText("Recovery code (preferred)");
    await expect.poll(() => bridge.preferred).toBe("recovery");
    expect(bridge.patches).toEqual([{ security: { preferredMfaMethod: "recovery" } }]);
  });

  test("Turn off calls disable and the row goes back to Add verification method", async ({ page, baseURL }) => {
    const bridge = await stubTwoStep(page, { enabled: true, recoveryRemaining: 4 });
    await openProfile(page, baseURL);
    await openModal(page, "Manage");
    await dialog(page).getByRole("button", { name: "Turn off" }).click();
    await expect(region(page).getByRole("button", { name: "Add verification method", exact: true })).toBeVisible();
    expect(bridge.calls).toContain("POST /api/account/2fa/disable");
  });
});

test.describe("Manage emails modal (bridge stub)", () => {
  const emailsDialog = (page) => page.getByRole("dialog", { name: "Manage emails" });

  test("is read-only: the one address, no edit controls, and the unavailable line", async ({ page, baseURL }) => {
    await stubTwoStep(page);
    await openProfile(page, baseURL);
    await openModal(page, "Manage emails");
    await expect(emailsDialog(page)).toContainText("e2e@example.com");
    await expect(emailsDialog(page).getByRole("button", { name: /Add email|Remove|Make primary|Verify/ })).toHaveCount(0);
    await expect(emailsDialog(page).getByPlaceholder("name@example.com")).toHaveCount(0);
    await expect(emailsDialog(page)).toContainText("Adding or changing addresses isn't available yet.");
  });

  test("a failed read never shows Verified", async ({ page, baseURL }) => {
    await stubTwoStep(page, { emailsDown: true });
    await openProfile(page, baseURL);
    await openModal(page, "Manage emails");
    await expect(emailsDialog(page)).not.toContainText("Verified");
  });
});

test.describe("Passkeys modal (bridge stub)", () => {
  const PASSKEYS = [passkeyRow("11111111-1111-4111-8111-111111111111", "Laptop"), passkeyRow("22222222-2222-4222-8222-222222222222", "Phone")];

  test("lists the server's passkeys, has no Add control and says why", async ({ page, baseURL }) => {
    await stubTwoStep(page, { passkeys: PASSKEYS });
    await openProfile(page, baseURL);
    await openModal(page, "Manage passkeys");
    const modal = page.getByRole("dialog", { name: "Passkeys" });
    await expect(modal.getByLabel("Passkey name")).toHaveCount(2);
    await expect(modal.getByRole("button", { name: /Add passkey/ })).toHaveCount(0);
    await expect(modal.getByText(/new passkeys are added when you sign in/)).toBeVisible();
  });

  test("rename PATCHes the passkey and Remove DELETEs it", async ({ page, baseURL }) => {
    const bridge = await stubTwoStep(page, { passkeys: PASSKEYS });
    await openProfile(page, baseURL);
    await openModal(page, "Manage passkeys");
    const modal = page.getByRole("dialog", { name: "Passkeys" });
    await modal.getByLabel("Passkey name").first().fill("Work laptop");
    await modal.getByLabel("Passkey name").first().blur();
    await expect.poll(() => bridge.bodies.rename).toEqual({ nickname: "Work laptop" });
    await modal.getByRole("button", { name: "Remove" }).last().click();
    await expect(modal.getByLabel("Passkey name")).toHaveCount(1);
    expect(bridge.calls).toContain(`DELETE /api/account/passkeys/${PASSKEYS[1]._id}`);
  });
});
