/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   themeAuthority.spec.mjs                            :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// One owner for light/dark: the app. Opening a database used to flip the page
// to the OS theme (the vendored database store wrote <html data-theme> when
// its code loaded), and an old per-workspace appearance wrote colours inline
// on <html>, above every palette.

import { expect, test } from "@playwright/test";

import { insertInlineDatabase } from "../support/databaseHelpers.mjs";

const html = (page) => page.locator("html");

/** Stores the theme mode before the app boots, and records every value
 *  <html data-theme> takes from then on. */
async function bootWithThemeMode(page, mode) {
  await page.addInitScript((stored) => {
    if (!sessionStorage.getItem("theme-authority-seeded")) {
      localStorage.setItem("osionos:theme-mode", stored);
      sessionStorage.setItem("theme-authority-seeded", "1");
    }
    window.__themeLog = [];
    new MutationObserver(() => {
      window.__themeLog.push(document.documentElement.dataset.theme);
    }).observe(document, { subtree: true, attributes: true, attributeFilter: ["data-theme"] });
  }, mode);
}

const storedMode = (page) => page.evaluate(() => localStorage.getItem("osionos:theme-mode"));

/** Opens the app and waits until its boot has finished: the boot re-applies
 *  the stored theme when the user store is ready, which would hide a missing
 *  OS listener if the OS changed before that. */
async function openBooted(page, baseURL) {
  await page.goto(baseURL, { waitUntil: "domcontentloaded" });
  await page.getByText("Explorer", { exact: true }).waitFor();
  await page.waitForFunction(async () => (await import("/src/features/auth/model/useUserStore.ts")).useUserStore.getState().initialized);
}

test.describe("theme authority", () => {
  test("opening a database never flips the app's light theme to the OS's dark one", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await bootWithThemeMode(page, "light");
    const block = await insertInlineDatabase(page);
    // The database's own controls come from its lazy chunk, the one that
    // carries its theme store: once they render, that code has run.
    await block.locator('[aria-label="Add property"]').waitFor();
    await expect(html(page)).toHaveAttribute("data-theme", "light");
    expect(await page.evaluate(() => window.__themeLog.filter((value) => value !== "light"))).toEqual([]);
  });

  test("in system mode the theme follows the OS while the app is open", async ({ page, baseURL }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await bootWithThemeMode(page, "system");
    await openBooted(page, baseURL);
    await expect(html(page)).toHaveAttribute("data-theme", "light");
    await page.emulateMedia({ colorScheme: "dark" });
    await expect(html(page)).toHaveAttribute("data-theme", "dark");
  });

  test("toggling back to the OS's theme returns to system mode", async ({ page, baseURL }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await bootWithThemeMode(page, "system");
    await openBooted(page, baseURL);
    const toggle = () => page.evaluate(async () => {
      const { toggleThemeMode } = await import("/src/shared/config/theme.ts");
      toggleThemeMode();
    });
    await toggle();
    await expect(html(page)).toHaveAttribute("data-theme", "dark");
    expect(await storedMode(page)).toBe("dark");
    await toggle();
    await expect(html(page)).toHaveAttribute("data-theme", "light");
    expect(await storedMode(page)).toBe("system");
  });

  test("native controls follow the app's theme, not the OS's", async ({ page, baseURL }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await bootWithThemeMode(page, "dark");
    await page.goto(baseURL, { waitUntil: "domcontentloaded" });
    await expect(html(page)).toHaveAttribute("data-theme", "dark");
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme)).toBe("dark");
  });

  test("a stored per-workspace appearance writes no colour onto <html>", async ({ page, baseURL }) => {
    await page.goto(baseURL, { waitUntil: "domcontentloaded" });
    await page.getByText("Explorer", { exact: true }).waitFor();
    await page.evaluate(async () => {
      const { useUserStore } = await import("/src/features/auth/model/useUserStore.ts");
      const { useWorkspaceConfigStore, workspaceConfigKey } = await import("/src/shared/config/workspaceConfigStore.ts");
      const users = useUserStore.getState();
      const key = workspaceConfigKey(users.activeUserId || "anonymous", users.activeWorkspace()?._id ?? "workspace");
      const appearance = { themeName: "Legacy", tokens: { ink: "#111111", muted: "#555555", surface: "#ff0000", surfaceSecondary: "#ff0000", surfaceHover: "#ff0000", accent: "#00ff00", line: "#cccccc" } };
      useWorkspaceConfigStore.setState((state) => ({ configs: { ...state.configs, [key]: { channels: [], ...state.configs[key], appearance } } }));
    });
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => [...document.documentElement.style].filter((name) => name.startsWith("--osio-")))).toEqual([]);
  });
});
