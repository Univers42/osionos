// With no hosted sandbox and no osionos Connector answering, Terminal › New Terminal opens this
// computer's terminal in place, in the dock: no second window, no shell commands, plain words and
// a Try again button (owner, 2026-11-01; de444432 deleted the window launcher that printed commands).
// The pairing code field the panel takes (8ce4a4d2) is machinePairCode.spec.mjs.

import { expect, test } from "@playwright/test";

import { openFreshPage } from "../../browser/core/app.mjs";

test("no node answering: New Terminal opens in place and says the Connector isn't running", async ({ page, baseURL }) => {
  test.setTimeout(90_000);
  await openFreshPage(page, baseURL);
  const windows = [];
  page.context().on("page", (opened) => windows.push(opened.url()));
  await page.getByRole("button", { name: "Terminal", exact: true }).first().click();
  await page.getByRole("menuitem", { name: /new terminal/i }).first().click();
  const dock = page.getByTestId("workbench-dock");
  await expect(dock.locator('[data-osio-terminal] iframe[title="Terminal"]')).toHaveCount(1);
  // The 8 s ready timeout (TERMINAL_READY_TIMEOUT_MS) then the old-node probe come first.
  const state = dock.getByRole("status").filter({ hasText: "osionos Connector isn't running on this computer." });
  await expect(state).toBeVisible({ timeout: 30_000 });
  await expect(state.getByRole("button", { name: "Try again" })).toBeVisible();
  await expect(dock.getByText(/osionos-node (pair|serve)|install osionos-node/)).toHaveCount(0);
  await page.screenshot({ path: "test-results/evidence/machine-terminal-in-place.png" });
  expect(windows).toEqual([]);
});
