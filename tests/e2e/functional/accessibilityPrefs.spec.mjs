/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   accessibilityPrefs.spec.mjs                         :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Accessibility preferences: link underlines, motion, animated images,
// hovercards and what a pasted URL becomes. Each one is an attribute on <html>
// written by theme.ts, mirrored by the boot script in index.html so a stored
// choice is there before first paint, and kept under one localStorage key.

import { expect, test } from "@playwright/test";

import {
  activateFirstEditor,
  createBlockViaSlash,
  embedMediaViaLink,
  openFreshPage,
  pasteText,
} from "../../browser/core/app.mjs";

const html = (page) => page.locator("html");
const storedAppearance = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("osionos:appearance") ?? "null"));

/** Stores a light theme and, once per tab, the raw appearance value before the app boots. */
async function seed(page, appearance) {
  await page.addInitScript((raw) => {
    if (sessionStorage.getItem("appearance-seeded")) return;
    sessionStorage.setItem("appearance-seeded", "1");
    localStorage.setItem("osionos:theme-mode", "light");
    if (raw !== null) localStorage.setItem("osionos:appearance", raw);
  }, appearance === undefined ? null : typeof appearance === "string" ? appearance : JSON.stringify(appearance));
}

/** Counts every play() a media element is asked for. */
async function countMediaPlays(page) {
  await page.addInitScript(() => {
    window.__mediaPlays = 0;
    const original = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function patched() {
      window.__mediaPlays += 1;
      return original.call(this).catch(() => undefined);
    };
  });
}

const mediaPlays = (page) => page.evaluate(() => window.__mediaPlays);

/** The text-decoration of a plain link in the page. Today's rule underlines the
 *  editor links only, so a link outside the editor tells the two modes apart. */
async function plainLinkDecoration(page) {
  return page.evaluate(() => {
    const probe = document.createElement("a");
    probe.href = "#";
    probe.textContent = "probe";
    document.body.append(probe);
    const value = getComputedStyle(probe).textDecorationLine;
    probe.remove();
    return value;
  });
}

/** The duration of a known transition, read on a probe the app's own reset sees. */
async function transitionDuration(page) {
  return page.evaluate(() => {
    const probe = document.createElement("div");
    probe.style.transition = "opacity 1s linear";
    document.body.append(probe);
    const value = getComputedStyle(probe).transitionDuration;
    probe.remove();
    return value;
  });
}

/** The editor's text, without the zero-width space the renderer leaves after a link. */
async function editorText(editor) {
  return ((await editor.textContent()) ?? "").replaceAll("\u200B", "").trim();
}

/** Sets a video cover through the page header's picker (the URL tab). */
async function setVideoCover(page) {
  await page.getByRole("button", { name: "Add cover" }).click();
  const picker = page.locator(".osionos-cover-picker");
  await picker.getByRole("button", { name: "URL", exact: true }).click();
  await picker.getByPlaceholder("https://images.unsplash.com/...").fill("https://example.com/fixtures/cover.mp4");
  await picker.getByRole("button", { name: "Use URL" }).click();
}

/** The fixture URL is unreachable offline, so the cover video can never load.
 *  A canvas stream gives it something to play, which is what makes "the play
 *  button plays it" a fact about the button and not about the network. */
async function attachPlayableStream(page) {
  await page.evaluate(async () => {
    const video = document.querySelector('[data-testid="page-cover-video"]');
    const canvas = document.createElement("canvas");
    canvas.width = 16;
    canvas.height = 16;
    const context = canvas.getContext("2d");
    const paint = () => {
      context.fillRect(0, 0, 16, 16);
      requestAnimationFrame(paint);
    };
    paint();
    video.srcObject = canvas.captureStream(10);
    await new Promise((resolve) => {
      if (video.readyState >= 2) resolve();
      else {
        video.addEventListener("loadeddata", resolve, { once: true });
        setTimeout(resolve, 2000);
      }
    });
  });
}

async function openPreferences(page) {
  await page.getByRole("button", { name: "Settings", exact: true }).first().click();
  await page.getByRole("region", { name: "Settings", exact: true }).waitFor();
  await page.getByRole("navigation", { name: "Settings sections" }).getByRole("button", { name: "Preferences" }).click();
}

test.describe("accessibility preferences", () => {
  test("link underlines: always underlines every link at rest", async ({ page, baseURL }) => {
    await seed(page, { linkUnderline: "always" });
    await openFreshPage(page, baseURL);
    await expect(html(page)).toHaveAttribute("data-link-underline", "always");

    const editor = await activateFirstEditor(page);
    await editor.click();
    await page.keyboard.type("https://example.com/a");
    const editorLink = editor.locator("a.editor-link").first();
    await expect(editorLink).toBeVisible();
    expect(await editorLink.evaluate((node) => getComputedStyle(node).textDecorationLine)).toBe("underline");
    // A link outside the editor is underlined too — today's rule does not do that.
    expect(await plainLinkDecoration(page)).toBe("underline");
  });

  test("link underlines: the default keeps today's rule", async ({ page, baseURL }) => {
    await seed(page);
    await openFreshPage(page, baseURL);
    await expect(html(page)).not.toHaveAttribute("data-link-underline", /.*/);

    const editor = await activateFirstEditor(page);
    await editor.click();
    await page.keyboard.type("https://example.com/a");
    const editorLink = editor.locator("a.editor-link").first();
    await expect(editorLink).toBeVisible();
    expect(await editorLink.evaluate((node) => getComputedStyle(node).textDecorationLine)).toBe("underline");
    expect(await plainLinkDecoration(page)).toBe("none");
  });

  test("motion: reduce collapses the transitions even when the system does not ask for it", async ({ page, baseURL }) => {
    await seed(page, { motion: "reduce" });
    await openFreshPage(page, baseURL);
    await expect(html(page)).toHaveAttribute("data-motion", "reduce");
    expect(Number.parseFloat(await transitionDuration(page))).toBeLessThanOrEqual(0.01);
  });

  test("motion: full keeps the motion even when the system asks for less", async ({ page, baseURL }) => {
    await seed(page, { motion: "full" });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openFreshPage(page, baseURL);
    await expect(html(page)).toHaveAttribute("data-motion", "full");
    expect(Number.parseFloat(await transitionDuration(page))).toBeGreaterThan(0.5);
  });

  test("motion: system follows the system", async ({ page, baseURL }) => {
    await seed(page);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openFreshPage(page, baseURL);
    await expect(html(page)).not.toHaveAttribute("data-motion", /.*/);
    expect(Number.parseFloat(await transitionDuration(page))).toBeLessThanOrEqual(0.01);

    await page.emulateMedia({ reducedMotion: "no-preference" });
    await expect.poll(async () => Number.parseFloat(await transitionDuration(page))).toBeGreaterThan(0.5);
  });

  test("animated images: still holds a video cover on its first frame and offers a play button", async ({ page, baseURL }) => {
    await seed(page, { animatedImages: "still" });
    await countMediaPlays(page);
    await openFreshPage(page, baseURL);
    await setVideoCover(page);

    const video = page.getByTestId("page-cover-video");
    await expect(video).toBeVisible();
    // Nothing autoplays: the cover waits for the person.
    expect(await mediaPlays(page)).toBe(0);
    expect(await video.evaluate((node) => node.paused)).toBe(true);

    const toggle = page.getByTestId("page-cover-video-toggle");
    await expect(toggle).toBeVisible();
    await attachPlayableStream(page);
    await toggle.click();
    expect(await mediaPlays(page)).toBe(1);
    await expect.poll(async () => video.evaluate((node) => node.paused)).toBe(false);
  });

  test("animated images: play keeps today's autoplay", async ({ page, baseURL }) => {
    await seed(page, { animatedImages: "play" });
    await countMediaPlays(page);
    await openFreshPage(page, baseURL);
    await setVideoCover(page);

    await expect(page.getByTestId("page-cover-video")).toBeVisible();
    await expect.poll(async () => mediaPlays(page)).toBeGreaterThan(0);
    await expect(page.getByTestId("page-cover-video-toggle")).toHaveCount(0);
  });

  test("animated images: still renders a GIF block as a canvas until Play", async ({ page, baseURL }) => {
    await seed(page, { animatedImages: "still" });
    await openFreshPage(page, baseURL);
    await createBlockViaSlash(page, "image", "Image");
    await page.getByTestId("media-block-editor").getByRole("button", { name: /^Add image$/i }).click();
    await embedMediaViaLink(page, "image", "https://example.com/fixtures/anim-0.gif");

    const block = page.getByTestId("media-block-editor");
    await expect(block.getByTestId("media-block-image-canvas")).toBeVisible();
    await expect(block.getByTestId("media-block-image")).toHaveCount(0);
    // The play control is a SIBLING of the edit button, never inside it: a
    // button inside a button is invalid HTML (axe nested-interactive) and a
    // keyboard cannot reach the inner one.
    await expect(block.locator("button button, [role=button] button, a button")).toHaveCount(0);
    // The edit button still opens the media settings from the keyboard.
    await block.getByRole("button", { name: "Edit image" }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("button", { name: /^Change image$/i })).toBeVisible();
    // Play swaps the live image in.
    await block.getByTestId("media-block-image-play").click();
    await expect(block.getByTestId("media-block-image")).toBeVisible();
    await expect(block.getByTestId("media-block-image-canvas")).toHaveCount(0);
  });

  test("animated images: still holds the read-only picture too, with no nested control", async ({ page, baseURL }) => {
    await seed(page, { animatedImages: "still" });
    await openFreshPage(page, baseURL);
    await createBlockViaSlash(page, "image", "Image");
    await page.getByTestId("media-block-editor").getByRole("button", { name: /^Add image$/i }).click();
    await embedMediaViaLink(page, "image", "https://example.com/fixtures/anim-0.gif");

    // The raw-mode preview renders the page with the read-only renderer.
    await page.getByRole("button", { name: "Open page configuration" }).click();
    await page.getByRole("button", { name: "Raw / code mode" }).click();
    const preview = page.locator("[data-raw-mode]");
    await expect(preview).toBeVisible();
    await expect(preview.getByTestId("media-block-image-canvas")).toBeVisible();
    await expect(preview.getByTestId("media-block-image")).toHaveCount(0);
    await expect(preview.locator("button button, [role=button] button, a button")).toHaveCount(0);
  });

  test("a theme change keeps the accessibility choice: both panels write one appearance", async ({ page, baseURL }) => {
    await seed(page);
    await openFreshPage(page, baseURL);
    await openPreferences(page);
    await page.getByRole("group", { name: "Link underlines" }).waitFor();

    await page.getByRole("group", { name: "Link underlines", exact: true }).getByRole("tab", { name: "Always" }).click();
    await expect(html(page)).toHaveAttribute("data-link-underline", "always");

    // The theme controls write to the same live appearance, so the choice stays.
    await page.getByRole("group", { name: "Density", exact: true }).getByRole("tab", { name: "Compact" }).click();
    await expect(html(page)).toHaveAttribute("data-density", "compact");
    await expect(html(page)).toHaveAttribute("data-link-underline", "always");
    expect((await storedAppearance(page)).linkUnderline).toBe("always");
  });

  test("hovercards: off keeps a card from opening under the pointer; the keyboard opens it", async ({ page, baseURL }) => {
    await seed(page, { hovercards: "off" });
    await openFreshPage(page, baseURL);
    await expect(html(page)).toHaveAttribute("data-hovercards", "off");

    await page.getByRole("button", { name: "Settings", exact: true }).first().click();
    const region = page.getByRole("region", { name: "Settings", exact: true });
    await region.waitFor();
    await page.getByRole("navigation", { name: "Settings sections" }).getByRole("button", { name: "People" }).click();
    await region.getByRole("tab", { name: /Members/ }).click();

    const row = region.locator("tbody tr").first();
    await expect(row).toBeVisible();
    await row.hover();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await row.locator("button").first().focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("dialog")).toBeVisible();
  });

  test("url paste: plain leaves the URL as text", async ({ page, baseURL }) => {
    await seed(page, { urlPaste: "plain" });
    await openFreshPage(page, baseURL);
    const editor = await activateFirstEditor(page);
    await pasteText(editor, "https://example.com/a");
    await expect.poll(async () => editorText(editor)).toBe("https://example.com/a");
  });

  test("url paste: link turns the URL into a link", async ({ page, baseURL }) => {
    await seed(page, { urlPaste: "link" });
    await openFreshPage(page, baseURL);
    const editor = await activateFirstEditor(page);
    await pasteText(editor, "https://example.com/a");
    await expect.poll(async () => editorText(editor)).toBe("example.com");
  });

  test("the motion choice is on <html> before the app mounts", async ({ page, baseURL }) => {
    await seed(page, { motion: "reduce" });
    await page.addInitScript(() => {
      window.__firstMotion = null;
      // <html> does not exist yet when init scripts run, so watch the document.
      new MutationObserver(() => {
        if (window.__firstMotion) return;
        const motion = document.documentElement.dataset.motion;
        if (!motion) return;
        window.__firstMotion = { motion, readyState: document.readyState, mounted: Boolean(document.getElementById("root")?.firstChild) };
      }).observe(document, { attributes: true, subtree: true });
    });
    await page.goto(baseURL, { waitUntil: "domcontentloaded" });
    const first = await page.evaluate(() => window.__firstMotion);
    expect(first).toEqual({ motion: "reduce", readyState: "loading", mounted: false });
  });

  test("the Accessibility controls change each choice live and survive a reload", async ({ page, baseURL }) => {
    await seed(page);
    await openFreshPage(page, baseURL);
    await openPreferences(page);
    await page.getByRole("group", { name: "Motion" }).waitFor();

    const tab = (group, name) => page.getByRole("group", { name: group, exact: true }).getByRole("tab", { name, exact: true });

    await tab("Link underlines", "Always").click();
    await expect(html(page)).toHaveAttribute("data-link-underline", "always");
    await tab("Motion", "Reduce").click();
    await expect(html(page)).toHaveAttribute("data-motion", "reduce");
    await tab("Animated images", "Still").click();
    await expect(html(page)).toHaveAttribute("data-animated-images", "still");
    await page.getByRole("switch", { name: "Hovercards" }).click();
    await expect(html(page)).toHaveAttribute("data-hovercards", "off");
    await tab("Paste a link", "Plain").click();
    // urlPaste has no attribute: it is stored, not written on <html>.
    expect((await storedAppearance(page)).urlPaste).toBe("plain");

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(html(page)).toHaveAttribute("data-link-underline", "always");
    await expect(html(page)).toHaveAttribute("data-motion", "reduce");
    await expect(html(page)).toHaveAttribute("data-animated-images", "still");
    await expect(html(page)).toHaveAttribute("data-hovercards", "off");
    expect((await storedAppearance(page)).urlPaste).toBe("plain");
  });
});
