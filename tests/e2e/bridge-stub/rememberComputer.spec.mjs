// One emailed code per computer, measured in Chrome (devil verdict 2026-11-01, Amendment 1, R12): the
// first terminal asks for the code with "Remember this computer" checked; three reloads and two new
// tabs then open the terminal with no code. The step-up endpoint is called exactly once, and every
// later load is a resume assertion beside the device secret the frame kept. The node is the real
// IDE origin on 127.0.0.1:4100 serving the built terminal page (tests/e2e/support/rememberedNode.mjs).

import { expect, test } from "@playwright/test";

import { openSignedIn } from "../support/bridgeStub.mjs";
import { seedSession } from "../support/bridgeSession.mjs";
import { routePtyToNode, startRememberingNode, stubMachineBridge, terminalPageBuilt } from "../support/rememberedNode.mjs";

const dockOf = (page) => page.getByTestId("workbench-dock");

// What openSignedIn does after its goto, for a page that was reloaded in place.
async function signedInAfterReload(page) {
  await page.getByRole("button", { name: "Settings", exact: true }).first().waitFor();
  await page.evaluate(() => globalThis.__playgroundUserStore.setState({ activePageJwt: () => "e2e-page-jwt" }));
}

async function openTerminal(page) {
  await page.getByRole("button", { name: "Terminal", exact: true }).first().click();
  await page.getByRole("menuitem", { name: /new terminal/i }).first().click();
  await expect(dockOf(page).locator('[data-osio-terminal] iframe[title="Terminal"]')).toHaveCount(1);
}

const connected = (page) => expect(dockOf(page).locator('[data-osio-terminal] [role="status"]')).toHaveCount(0, { timeout: 60_000 });

test("R12, R8: one step-up with Remember checked; 3 reloads and 2 new tabs open with no code; Forget brings the token path back", async ({ context, page, baseURL }) => {
  test.skip(!terminalPageBuilt(), "build the terminal page first: vite build --config vite.terminal.config.ts");
  test.setTimeout(300_000);
  const appOrigin = new URL(baseURL).origin;
  const node = await startRememberingNode(appOrigin);
  test.info().attachments.push({ name: "app origin", contentType: "text/plain", body: Buffer.from(appOrigin) });
  try {
    const calls = await stubMachineBridge(context, node);
    await routePtyToNode(context, node);
    const frameConsole = [];
    // Caveat: Playwright's Firefox logs "Layout was forced before the page was fully loaded" for 1 to
    // 2 of 3 loads of any page the dock frames, a static one with no script or stylesheet included
    // (measured 2026-11-04, Firefox 1511; #305). So the page does not write it. It is dropped by its
    // exact text. A page that really forces layout early would be hidden by this filter.
    context.on("console", (message) => {
      if (!["error", "warning"].includes(message.type()) || !message.location().url.startsWith("http://127.0.0.1:4100")) return;
      if (message.text().startsWith('[JavaScript Warning: "Layout was forced before the page was fully loaded.')) return;
      frameConsole.push(`${message.type()}: ${message.text()}`);
    });
    await seedSession(context, {});

    await openSignedIn(page, baseURL);
    await openTerminal(page);
    const prompt = page.getByRole("dialog", { name: "Confirm it's you" });
    await expect(prompt.getByRole("checkbox", { name: "Remember this computer" })).toBeChecked();
    await expect(prompt.getByText("Don't check this on a shared computer.", { exact: false })).toBeVisible();
    await prompt.getByRole("button", { name: "Email me a code" }).click();
    await prompt.getByLabel("Six-digit code").fill("123456");
    await prompt.getByRole("button", { name: "Confirm" }).click();
    await connected(page);
    expect(node.devices.count()).toBe(1);

    for (let reload = 0; reload < 3; reload += 1) {
      await page.reload();
      await signedInAfterReload(page);
      await openTerminal(page);
      await connected(page);
      await expect(page.getByRole("dialog", { name: "Confirm it's you" })).toHaveCount(0);
    }
    for (let tab = 0; tab < 2; tab += 1) {
      const opened = await context.newPage();
      await openSignedIn(opened, baseURL);
      await openTerminal(opened);
      await connected(opened);
      await expect(opened.getByRole("dialog", { name: "Confirm it's you" })).toHaveCount(0);
    }

    test.info().attachments.push({ name: "bridge calls", contentType: "application/json", body: Buffer.from(JSON.stringify(calls)) });
    expect(calls.sudoEmail, "the step-up endpoint").toBe(1);
    expect(calls.sudoVerify).toBe(1);
    // #293: the app reads the step-up state first, so no mint is refused (Chrome logs every 403).
    expect(calls.tokenRefused, "no mint before the step-up").toBe(0);
    expect(calls.token).toBe(1);
    expect(calls.rememberedTokens).toBe(1);
    expect(calls.resume).toBeGreaterThanOrEqual(5);
    const resumesBeforeForget = calls.resume;
    expect(node.devices.count(), "no device secret was issued from a remembered open").toBe(1);
    expect(frameConsole, "the terminal page logs nothing").toEqual([]);
    await page.screenshot({ path: "test-results/evidence/remember-this-computer.png" });

    // R8: Forget this computer, from the dock, through a hidden frame of the node's page; the next
    // load takes the token path again (the emailed-code one, once the step-up window has closed).
    await page.bringToFront();
    await dockOf(page).getByRole("button", { name: "Forget this computer" }).click();
    await expect(page.getByText("This computer is forgotten")).toBeVisible({ timeout: 30_000 });
    expect(node.devices.count()).toBe(0);
    await page.reload();
    await signedInAfterReload(page);
    await openTerminal(page);
    // The stub's step-up window is still open, so the token path mints without a prompt here.
    await connected(page);
    expect(calls.resume, "a forgotten frame asks for no resume").toBe(resumesBeforeForget);
    expect(calls.token, "it took the token path").toBeGreaterThan(1);
  } finally {
    node.stop();
  }
});
