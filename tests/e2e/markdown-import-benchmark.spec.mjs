/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   markdown-import-benchmark.spec.mjs                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/05/18 21:19:22 by dlesieur          #+#    #+#             */
/*   Updated: 2026/05/18 21:19:22 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Markdown Import Benchmark
 *
 * For each .md file in markengine/docs and markengine root:
 *   1. Creates a new page in the osionos app
 *   2. Imports the file via the hidden file-input in the PageHeaderBar
 *   3. Measures time from import-start to blocks fully rendered
 *   4. Takes a screenshot for visual verification
 *
 * Prerequisites (all already running in the full track-binocle stack):
 *   - osionos app     → http://localhost:3001
 *   - osionos bridge  → http://localhost:4000
 *
 * Run:
 *   PLAYWRIGHT_REUSE_EXISTING_SERVER=1 \
 *   PLAYWRIGHT_BASE_URL=http://localhost:3001 \
 *   PLAYWRIGHT_PORT=3001 \
 *   node --import tsx ./node_modules/.bin/playwright test \
 *     tests/e2e/markdown-import-benchmark.spec.mjs --headed
 *
 * Or via Docker browser-tests service:
 *   PLAYWRIGHT_REUSE_EXISTING_SERVER=1 \
 *   PLAYWRIGHT_BASE_URL=http://track-binocle-osionos-app-1:3001 \
 *   docker compose -f docker-compose.base.yml -f docker-compose.dev.yml \
 *     run --rm --no-deps browser-tests \
 *     pnpm exec playwright test tests/e2e/markdown-import-benchmark.spec.mjs
 */

// @ts-check
import { test, expect } from "@playwright/test";
import { createHmac, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
// __dirname = .../apps/osionos/app/tests/e2e  → 2 levels up = apps/osionos/app/
const APP_ROOT = resolve(__dirname, "../../");
const MARKENGINE_ROOT = resolve(APP_ROOT, "src/shared/lib/markengine");

// ── Bridge config (read from env, same vars injected into track-binocle-osionos-bridge-1) ──
const BRIDGE_URL = process.env.OSIONOS_BRIDGE_URL ?? "http://localhost:4000";
function extractSecretFromLines(lines) {
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const [key, ...rest] = trimmed.split("=");
    if (key !== "OSIONOS_BRIDGE_SHARED_SECRET") continue;
    let val = rest.join("=").trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (val) return val;
  }
  return "";
}

function readBridgeSecretFromEnvFiles() {
  const envFiles = [
    resolve(APP_ROOT, ".env.local"),
    resolve(APP_ROOT, ".env"),
    resolve(APP_ROOT, "../../../.env.local"),
  ];
  for (const envFile of envFiles) {
    try {
      const secret = extractSecretFromLines(readFileSync(envFile, "utf8").split(/\r?\n/));
      if (secret) return secret;
    } catch {
      // file not found – try next
    }
  }
  return "";
}

const BRIDGE_SECRET =
  process.env.OSIONOS_BRIDGE_SHARED_SECRET ?? readBridgeSecretFromEnvFiles();

/** Sorted-key JSON (matches stableStringify in bridge-api.mjs) */
function stableStringify(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value))
    return `[${value.map(stableStringify).join(",")}]`;
  const entries = Object.keys(value)
    .sort((a, b) => a.localeCompare(b))
    .map((k) => JSON.stringify(k) + ":" + stableStringify(value[k]));
  return "{" + entries.join(",") + "}";
}

/** Compute the bridge HMAC-SHA256 signature */
function bridgeSignature(secret, timestamp, payload) {
  return createHmac("sha256", secret)
    .update(`${timestamp}.${stableStringify(payload)}`)
    .digest("hex");
}

/**
 * Creates a bridge handoff session and returns the osionos app redirect URL.
 * The redirect URL contains `#bridge_token=<one-time-token>` so the app can
 * exchange it for a real session.
 */
async function createBridgeSession({
  name = "Dylan Admin",
  email = "admin-benchmark@playground.local",
  subject = "00000000-0000-5000-a000-000000000001",
} = {}) {
  if (!BRIDGE_SECRET) {
    throw new Error(
      "OSIONOS_BRIDGE_SHARED_SECRET is not set. " +
        "Export it from the container env or add it to apps/osionos/app/.env",
    );
  }
  const payload = {
    email,
    jti: randomUUID(),
    name,
    provider: "prismatica",
    subject,
  };
  const timestamp = String(Date.now());
  const signature = bridgeSignature(BRIDGE_SECRET, timestamp, payload);

  const res = await fetch(`${BRIDGE_URL}/api/auth/bridge/session`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-prismatica-bridge-timestamp": timestamp,
      "x-prismatica-bridge-signature": signature,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Bridge session creation failed (${res.status}): ${body.slice(0, 200)}`,
    );
  }

  const data = await res.json();
  if (!data.ok || !data.redirectUrl) {
    throw new Error(`Bridge returned unexpected payload: ${JSON.stringify(data).slice(0, 200)}`);
  }
  return data.redirectUrl;
}

// ── Markdown files to benchmark ─────────────────────────────────────────────
const MD_FILES = [
  {
    label: "README",
    path: resolve(MARKENGINE_ROOT, "README.md"),
  },
  {
    label: "docs.md (API reference)",
    path: resolve(MARKENGINE_ROOT, "docs.md"),
  },
  {
    label: "testing_markdown.md (syntax kitchen sink)",
    path: resolve(MARKENGINE_ROOT, "testing_markdown.md"),
  },
  {
    label: "Markdown_engine.md (engine overview)",
    path: resolve(MARKENGINE_ROOT, "docs/Markdown_engine.md"),
  },
  {
    label: "canonical-api-migration.md",
    path: resolve(MARKENGINE_ROOT, "docs/canonical-api-migration.md"),
  },
  {
    label: "issues.md (known issues)",
    path: resolve(MARKENGINE_ROOT, "docs/issues.md"),
  },
  {
    label: "phase-1-3-benchmark-report.md",
    path: resolve(MARKENGINE_ROOT, "docs/phase-1-3-benchmark-report.md"),
  },
  {
    label: "phase-2-closeout.md",
    path: resolve(MARKENGINE_ROOT, "docs/phase-2-closeout.md"),
  },
];

/** Results collected per file for the summary table */
const results = [];

// ── Helpers ──────────────────────────────────────────────────────────────────

async function waitForSidebarReady(page) {
  await page
    .locator('button[title="New page"]')
    .first()
    .waitFor({ state: "visible", timeout: 15_000 });
}

async function createNewPage(page) {
  const addPrivate = page.locator('button[title="Add to Private"]').first();
  const newPage = page.locator('button[title="New page"]').first();

  // Try either sidebar button
  const addVisible = await addPrivate.isVisible().catch(() => false);
  if (addVisible) {
    await addPrivate.click();
  } else {
    await newPage.waitFor({ state: "visible", timeout: 10_000 });
    await newPage.click();
  }
  // Wait for page title input
  await page.getByRole("textbox", { name: "Page title" }).waitFor({ timeout: 10_000 });
}

/**
 * Opens the page config menu, clicks the "Import" menu item, and sets the file
 * via Playwright's fileChooser interception (avoids native OS dialog).
 */
async function importMarkdownFile(page, filePath) {
  // Open the MoreHorizontal config button (⋯)
  const configBtn = page.locator('button[aria-label="Open page configuration"]').first();
  await configBtn.waitFor({ state: "visible", timeout: 10_000 });
  await configBtn.click();

  // Wait for the Import menu item to be visible
  const importBtn = page.locator('button:has-text("Import"), [role="menuitem"]:has-text("Import")').first();
  await importBtn.waitFor({ state: "visible", timeout: 5_000 });

  // Intercept file chooser BEFORE clicking Import (which fires input.click())
  const t0 = Date.now();
  const [fileChooser] = await Promise.all([
    page.waitForEvent("filechooser", { timeout: 5_000 }),
    importBtn.click(),
  ]);
  await fileChooser.setFiles(filePath);

  // Give the app a moment to close the menu and start processing
  await page.waitForTimeout(200);

  return t0;
}

/**
 * Wait until at least one block is rendered in the page editor / renderer.
 * Returns the elapsed milliseconds from t0.
 */
async function waitForBlocksRendered(page, t0) {
  // Blocks appear inside the main content area as [role="textbox"] editors or
  // read-only block wrappers.  Wait for any of them.
  await page
    .locator(
      '[role="textbox"][aria-multiline="true"], [data-block-id], .page-block',
    )
    .first()
    .waitFor({ state: "visible", timeout: 20_000 });

  // Give one more tick for all blocks to flush
  await page.waitForTimeout(300);
  return Date.now() - t0;
}

// ── Verification helpers ─────────────────────────────────────────────────────

/** Returns true when the page title matches the filename (minus extension). */
async function verifyPageTitle(page, filePath) {
  const expectedTitle = filePath
    .split("/")
    .pop()
    .replace(/\.(md|markdown|txt)$/, "");
  const titleLocator = page.getByRole("textbox", { name: "Page title" });
  const title = (await titleLocator.textContent()) ?? "";
  return title.toLowerCase().includes(expectedTitle.toLowerCase());
}

/** Rough check: at least N block-level elements should be present. */
async function verifyBlockCount(page, minBlocks = 3) {
  const count = await page
    .locator('[data-block-id], [role="textbox"][aria-multiline="true"]')
    .count();
  return count >= minBlocks;
}

/** Check that at least one heading block is rendered. Heading blocks are live
 *  editable [role="textbox"] divs (see EditableContent.tsx), never semantic
 *  <h1>/<h2>/<h3> tags — the block type lives in data-block-type, the same
 *  convention every other spec in this suite already keys off. */
async function verifyHeadingPresent(page) {
  const headings = await page
    .locator('[data-block-type="heading_1"], [data-block-type="heading_2"], [data-block-type="heading_3"]')
    .count();
  return headings > 0;
}

// ── Test setup: bridge login ──────────────────────────────────────────────────

let bridgeRedirectUrl = "";

test.beforeAll(async () => {
  try {
    bridgeRedirectUrl = await createBridgeSession();
  } catch (err) {
    console.warn(
      `[benchmark] Bridge unavailable (${err.message}). ` +
        "Will attempt offline-mode fallback.",
    );
    bridgeRedirectUrl = "";
  }
});

// ── Main test suite ───────────────────────────────────────────────────────────

test.describe("markdown-import-benchmark", () => {
  test.describe.configure({ mode: "serial" });

  /**
   * One test per markdown file.
   * Each test:
   *   1. Lands on the app (bridge session or offline fallback)
   *   2. Creates a new blank page
   *   3. Imports the .md file
   *   4. Measures render time
   *   5. Verifies basic structure
   *   6. Captures a screenshot
   */
  for (const { label, path } of MD_FILES) {
    test(`import "${label}"`, async ({ page }, testInfo) => {
      // ── 1. Navigate to the app ──
      if (bridgeRedirectUrl) {
        // Full bridge flow: the URL hash contains the one-time handoff token
        await page.goto(bridgeRedirectUrl, { waitUntil: "domcontentloaded" });
      } else {
        // Offline fallback: app must have VITE_ALLOW_OFFLINE_MODE=true
        await page.goto("/", { waitUntil: "domcontentloaded" });
      }

      // ── 2. Wait for sidebar ──
      await waitForSidebarReady(page);

      // ── 3. Create a new blank page ──
      await createNewPage(page);

      // ── 4. Import the markdown file ──
      let t0;
      try {
        t0 = await importMarkdownFile(page, path);
      } catch (err) {
        testInfo.annotations.push({
          type: "warn",
          description: `Import UI not found for "${label}": ${err.message}`,
        });
        throw err;
      }

      // ── 5. Wait for blocks to appear ──
      let elapsed;
      try {
        elapsed = await waitForBlocksRendered(page, t0);
      } catch {
        elapsed = Date.now() - t0;
        testInfo.annotations.push({
          type: "warn",
          description: `Blocks did not render within timeout for "${label}"`,
        });
      }

      // ── 6. Verify structure ──
      const titleOk = await verifyPageTitle(page, path);
      const blockCountOk = await verifyBlockCount(page);
      const headingOk = await verifyHeadingPresent(page);

      // Record results
      results.push({
        label,
        elapsedMs: elapsed,
        titleOk,
        blockCountOk,
        headingOk,
      });

      // ── 7. Screenshot ──
      const screenshotName = label
        .replaceAll(/[^a-z0-9]+/gi, "-")
        .replaceAll(/^-|-$/g, "")
        .toLowerCase();
      await page.screenshot({
        path: `playwright-report/markdown-benchmark-${screenshotName}.png`,
        fullPage: true,
      });

      // Attach screenshot to report
      await testInfo.attach(`screenshot-${screenshotName}`, {
        path: `playwright-report/markdown-benchmark-${screenshotName}.png`,
        contentType: "image/png",
      });

      // ── 8. Assertions ──
      expect(elapsed, `"${label}" should render in < 8s`).toBeLessThan(8_000);
      expect(blockCountOk, `"${label}" should have ≥3 blocks`).toBe(true);
      expect(headingOk, `"${label}" should have at least one heading`).toBe(true);
    });
  }

  // ── Summary report ─────────────────────────────────────────────────────────
  test("summary: print benchmark table", async ({}, testInfo) => {
    if (results.length === 0) {
      console.log("[benchmark] No results collected (all imports skipped).");
      return;
    }

    const total = results.reduce((s, r) => s + r.elapsedMs, 0);
    const avg = results.length ? Math.round(total / results.length) : 0;
    const rows = results.map((r) => {
      const name = r.label.slice(0, 47).padEnd(47);
      const ms = String(r.elapsedMs).padStart(8);
      const t = r.titleOk ? "  ✓  " : "  ✗  ";
      const b = r.blockCountOk ? "  ✓   " : "  ✗   ";
      const h = r.headingOk ? "   ✓   " : "   ✗   ";
      return `│ ${name} │${ms} │${t}│${b}│${h}│`;
    });
    const lines = [
      "",
      "┌─────────────────────────────────────────────────┬──────────┬───────┬────────┬─────────┐",
      "│ File                                            │ Time(ms) │ Title │ Blocks │ Heading │",
      "├─────────────────────────────────────────────────┼──────────┼───────┼────────┼─────────┤",
      ...rows,
      "└─────────────────────────────────────────────────┴──────────┴───────┴────────┴─────────┘",
      `  Total: ${total}ms  |  Avg: ${avg}ms per file`,
      "",
    ];

    const table = lines.join("\n");
    console.log(table);

    // Attach the table as a text artifact in the HTML report
    await testInfo.attach("benchmark-results.txt", {
      body: Buffer.from(table, "utf8"),
      contentType: "text/plain",
    });
  });
});
