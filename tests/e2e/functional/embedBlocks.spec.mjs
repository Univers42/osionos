// Embed and bookmark blocks, offline: no real third-party host is reached (every
// non-localhost request is answered with 204), so the frames assert on attributes, never
// on provider content. Hostile block JSON is seeded through the page cache because the
// editor UI refuses to create it.

import { expect, test } from "@playwright/test";

import {
  activateFirstEditor,
  explorerRow,
  openFreshPage,
  openSlashMenuFromEditor,
  selectSlashMenuEntry,
  slashCommandEntry,
} from "../../browser/core/app.mjs";
import { seedPage } from "../support/embedSeed.mjs";

const SANDBOX =
  "allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-forms allow-presentation";
const PROVIDER_ALLOW =
  "autoplay; encrypted-media; fullscreen; picture-in-picture; clipboard-write; web-share";
const RICH_ALLOW = "autoplay; encrypted-media; picture-in-picture; clipboard-write; web-share";
const GENERIC_ALLOW = "picture-in-picture";
const CODEPEN = "https://codepen.io/team/pen/abcDEF";
const YOUTUBE = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1"]);

test.beforeEach(async ({ page }) => {
  await page.route(
    (url) => !LOCAL_HOSTS.has(url.hostname),
    (route) =>
      route.request().url().endsWith("/sample.pdf")
        ? route.fulfill({ status: 200, contentType: "application/pdf", body: "%PDF-1.4\n%%EOF\n" })
        : route.fulfill({ status: 204 }),
  );
});

async function fillDialog(page, url) {
  const input = page.locator('input[type="url"]');
  await input.fill(url);
  await input.press("Enter");
}

async function createLinkBlock(page, baseURL, slash, entry, url) {
  await openFreshPage(page, baseURL);
  const editor = await activateFirstEditor(page);
  await openSlashMenuFromEditor(editor, slash);
  await selectSlashMenuEntry(page, entry);
  await fillDialog(page, url);
}

const linkBlock = (page) => page.getByTestId("link-block-editor");

test.describe("embed and bookmark blocks", () => {
  test("/embed with a YouTube link shows a facade that loads the hardened player on click", async ({ page, baseURL }) => {
    await createLinkBlock(page, baseURL, "/embed", "Embed", YOUTUBE);
    const play = linkBlock(page).getByRole("button", { name: /^Play .* on youtube/i });
    await expect(play).toBeVisible();
    await expect(linkBlock(page).locator("iframe")).toHaveCount(0);
    await play.click();
    const frame = linkBlock(page).locator("iframe");
    await expect(frame).toHaveAttribute("src", /^https:\/\/www\.youtube-nocookie\.com\/embed\/dQw4w9WgXcQ\?.*autoplay=1/);
    await expect(frame).toHaveAttribute("sandbox", SANDBOX);
    await expect(frame).toHaveAttribute("allow", PROVIDER_ALLOW);
    await expect(frame).toHaveAttribute("allowfullscreen", "");
    await expect(frame).toHaveAttribute("referrerpolicy", "strict-origin-when-cross-origin");
  });

  test("C30: a CodePen frame (provider rich) gets neither fullscreen in allow nor allowfullscreen", async ({ page, baseURL }) => {
    await createLinkBlock(page, baseURL, "/embed", "Embed", CODEPEN);
    const frame = linkBlock(page).locator("iframe");
    await expect(frame).toHaveAttribute("src", /^https:\/\/codepen\.io\/team\/embed\/abcDEF/);
    await expect(frame).toHaveAttribute("allow", RICH_ALLOW);
    await expect(frame).not.toHaveAttribute("allowfullscreen", /.*/);
  });

  test("a generic embed uses the narrow allow list, shows its host and converts to a bookmark", async ({ page, baseURL }) => {
    await createLinkBlock(page, baseURL, "/embed", "Embed", "https://example.com/");
    const frame = linkBlock(page).locator("iframe");
    await expect(frame).toHaveAttribute("allow", GENERIC_ALLOW);
    await expect(frame).not.toHaveAttribute("allowfullscreen", /.*/);
    await expect(frame).toHaveAttribute("sandbox", SANDBOX);
    await expect(linkBlock(page).getByText("example.com").first()).toBeVisible();
    await linkBlock(page).getByRole("button", { name: "Show as bookmark", exact: true }).click();
    await expect(page.getByLabel("Bookmark block")).toHaveCount(1);
    await expect(linkBlock(page).locator("iframe")).toHaveCount(0);
    await expect(linkBlock(page).getByText("example.com").first()).toBeVisible();
  });

  test("/bookmark makes a card showing the host and a safe Open link", async ({ page, baseURL }) => {
    await createLinkBlock(page, baseURL, "/bookmark", "Web bookmark", "https://example.com/page");
    await expect(linkBlock(page).locator("iframe")).toHaveCount(0);
    await expect(linkBlock(page).getByText("example.com").first()).toBeVisible();
    await expect(linkBlock(page).locator('a[href="https://example.com/page"]').first()).toBeAttached();
  });

  test("/youtube opens the dialog with the YouTube hint on an empty embed", async ({ page, baseURL }) => {
    await openFreshPage(page, baseURL);
    const editor = await activateFirstEditor(page);
    await openSlashMenuFromEditor(editor, "/youtube");
    await expect(slashCommandEntry(page, "YouTube")).toBeVisible();
    await selectSlashMenuEntry(page, "YouTube");
    await expect(page.locator('input[type="url"]')).toBeFocused();
    await expect(page.locator('input[type="url"]')).toHaveAttribute("placeholder", /youtube/i);
    await expect(linkBlock(page)).toHaveCount(1);
  });

  async function openVideoLinkTab(page, baseURL) {
    await openFreshPage(page, baseURL);
    const editor = await activateFirstEditor(page);
    await openSlashMenuFromEditor(editor, "/video");
    await selectSlashMenuEntry(page, "Video");
    await page.getByText("Embed or upload a video").click();
    await page.getByRole("tab", { name: /link/i }).click();
  }

  test("/video with a provider link renders a facade, not a <video>", async ({ page, baseURL }) => {
    await openVideoLinkTab(page, baseURL);
    await fillDialog(page, YOUTUBE);
    await expect(page.getByRole("button", { name: /^Play .* on youtube/i })).toBeVisible();
    await expect(page.locator("video")).toHaveCount(0);
  });

  test("/video with a direct file link stays a <video>", async ({ page, baseURL }) => {
    await openVideoLinkTab(page, baseURL);
    await fillDialog(page, "https://example.com/clip.mp4");
    await expect(page.locator("video")).toHaveCount(1);
  });

  test("embed and bookmark survive a reload", async ({ page, baseURL }) => {
    await seedPage(page, baseURL, [
      { id: "e1", type: "embed", content: "https://example.com/app" },
      { id: "b1", type: "bookmark", content: "https://example.org/read" },
    ]);
    await expect(linkBlock(page)).toHaveCount(2);
    await page.reload({ waitUntil: "domcontentloaded" });
    await explorerRow(page, "Embed seed").click();
    await expect(page.locator('[data-block-type="embed"] iframe')).toHaveAttribute("src", "https://example.com/app");
    await expect(page.locator('[data-block-type="bookmark"]').getByText("example.org").first()).toBeVisible();
  });

  test("C14: hostile block JSON never reaches an iframe, link or image", async ({ page, baseURL }) => {
    const hostile = (id, content, player) => ({
      id, type: "embed", content,
      embed: { v: 1, url: content, title: "x", provider: "youtube", frameable: true, image: content, player },
    });
    await seedPage(page, baseURL, [
      hostile("h1", "javascript:alert(1)", { src: "javascript:alert(2)", kind: "video" }),
      hostile("h2", "data:text/html,<script>alert(1)</script>", { src: "data:text/html,x", kind: "video" }),
      hostile("h3", "blob:https://example.com/1", { src: "blob:https://example.com/1", kind: "video" }),
      hostile("h4", "//evil.example/x", { src: "//evil.example/x", kind: "video" }),
      hostile("h5", "https://user:pass@example.com/", { src: "https://user:pass@example.com/", kind: "video" }),
      hostile("h6", "http://127.0.0.1:3004/", { src: "http://127.0.0.1:3004/", kind: "video" }),
    ]);
    await expect(page.locator('[data-block-type="embed"]').first()).toBeVisible();
    const offenders = await page.evaluate(() => {
      const bad = [];
      for (const frame of document.querySelectorAll('[data-block-type="embed"] iframe')) {
        bad.push(`iframe:${frame.getAttribute("src")}`);
      }
      for (const a of document.querySelectorAll("a[href]")) {
        if (/^(javascript|data|blob):/i.test(a.getAttribute("href"))) bad.push(`a:${a.getAttribute("href")}`);
      }
      for (const img of document.querySelectorAll('[data-block-type="embed"] img[src]')) {
        if (!/^https?:/i.test(img.getAttribute("src"))) bad.push(`img:${img.getAttribute("src")}`);
      }
      return bad;
    });
    expect(offenders).toEqual([]);
    await expect(page.getByText("javascript:alert(1)").first()).toBeVisible();
  });

  test("hostile fields inside a well-formed snapshot never reach an iframe, link or image", async ({ page, baseURL }) => {
    const wellFormed = (id, content, fields) => ({
      id, type: "embed", content,
      embed: {
        url: content, kind: "video", provider: null, title: "x", description: "", siteName: "x",
        image: "", favicon: "", player: null, media: null, frameable: true,
        resolvedAt: "2026-10-18T12:00:00.000Z", ...fields,
      },
    });
    await seedPage(page, baseURL, [
      wellFormed("w1", "https://example.com/a", { player: { src: "javascript:alert(1)", aspect: "16/9" } }),
      wellFormed("w2", "https://example.com/b", { player: { src: `${baseURL}/hostile-same-origin`, aspect: "16/9" } }),
      wellFormed("w3", "https://example.com/c", { image: "javascript:alert(2)", kind: "link", player: null }),
      wellFormed("w4", "https://example.com/d", { favicon: "data:text/html,x", kind: "link", player: null }),
      { id: "m1", type: "paragraph", content: '[google.com](https://google.com@evil.example/ "osio:mention") [ok](https://example.org/ "osio:mention")' },
    ]);
    await expect(page.locator('[data-block-type="embed"]').first()).toBeVisible();
    const offenders = await page.evaluate((origin) => {
      const bad = [];
      for (const frame of document.querySelectorAll("iframe")) {
        const src = frame.getAttribute("src") ?? "";
        if (/^(javascript|data|blob):/i.test(src) || src.startsWith(origin) || src.includes("hostile-same-origin")) bad.push(`iframe:${src}`);
      }
      for (const img of document.querySelectorAll('[data-block-type] img[src]')) {
        const src = img.getAttribute("src");
        if (!/^https?:/i.test(src)) bad.push(`img:${src}`);
      }
      for (const a of document.querySelectorAll("a[href]")) {
        if (a.getAttribute("href").includes("evil.example")) bad.push(`a:${a.getAttribute("href")}`);
      }
      return bad;
    }, baseURL);
    expect(offenders).toEqual([]);
    await expect(page.getByText("google.com").first()).toBeVisible();
  });

  test("a bookmark card names the host it opens, not the site name the page claims", async ({ page, baseURL }) => {
    await seedPage(page, baseURL, [{
      id: "b1", type: "bookmark", content: "https://evil.example/login",
      embed: {
        url: "https://evil.example/login", kind: "link", provider: null, title: "Sign in", description: "",
        siteName: "google.com", image: "", favicon: "", player: null, media: null, frameable: null,
        resolvedAt: "2026-10-18T12:00:00.000Z",
      },
    }]);
    const card = linkBlock(page).locator('a[href="https://evil.example/login"]').first();
    await expect(card).toBeAttached();
    const text = (await card.innerText()).toLowerCase();
    expect(text.indexOf("evil.example")).toBeGreaterThanOrEqual(0);
    expect(text.indexOf("evil.example")).toBeLessThan(text.indexOf("google.com"));
  });

  test("a generic embed's resize grip commits one height that survives a reload", async ({ page, baseURL }) => {
    await seedPage(page, baseURL, [{ id: "e1", type: "embed", content: "https://example.com/app" }]);
    const grip = page.getByRole("separator", { name: "Resize embed" });
    await linkBlock(page).hover();
    const before = await linkBlock(page).locator("iframe").evaluate((el) => el.parentElement.getBoundingClientRect().height);
    const box = await grip.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2, box.y + 120, { steps: 6 });
    await page.mouse.up();
    const after = await linkBlock(page).locator("iframe").evaluate((el) => el.parentElement.getBoundingClientRect().height);
    expect(after).toBeGreaterThan(before + 60);
    await page.reload({ waitUntil: "domcontentloaded" });
    await explorerRow(page, "Embed seed").click();
    const kept = await linkBlock(page).locator("iframe").evaluate((el) => el.parentElement.getBoundingClientRect().height);
    expect(Math.abs(kept - after)).toBeLessThan(2);
  });

  test("C20: a PDF link renders as a card with Open, not a blank sandboxed frame", async ({ page, baseURL }) => {
    await seedPage(page, baseURL, [
      { id: "f1", type: "file", content: "Report", asset: "https://docs.example.net/sample.pdf" },
      { id: "e1", type: "embed", content: "https://docs.example.net/sample.pdf" },
    ]);
    await expect(page.locator('article[data-block-type="embed"]')).toBeVisible();
    await expect(page.locator("iframe")).toHaveCount(0);
    await expect(page.locator('article[data-block-type="embed"] a[href="https://docs.example.net/sample.pdf"]').first()).toBeVisible();
    await expect(page.locator('article[data-block-type="file"] a[href="https://docs.example.net/sample.pdf"]').first()).toBeVisible();
  });
});
