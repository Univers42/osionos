/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   playwright.config.ts                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/05/18 21:19:16 by dlesieur          #+#    #+#             */
/*   Updated: 2026/05/18 21:19:16 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { defineConfig } from "@playwright/test";

function parsePositiveInt(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return undefined;
  }

  return parsed;
}

/**
 * `PLAYWRIGHT_SHARD` is "<current>/<total>" (e.g. "2/4"). CI splits the suite across parallel
 * jobs with it; unset (the local default) means "run everything in one pass".
 */
function parseShard(value: string | undefined): { current: number; total: number } | undefined {
  const match = /^(\d+)\/(\d+)$/.exec((value ?? "").trim());
  if (!match) {
    return undefined;
  }

  const current = Number.parseInt(match[1], 10);
  const total = Number.parseInt(match[2], 10);
  if (current < 1 || total < 1 || current > total) {
    return undefined;
  }

  return { current, total };
}

const testPort = parsePositiveInt(process.env.PLAYWRIGHT_PORT) ?? 3004;
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${testPort}`;
const configuredWorkers = parsePositiveInt(process.env.TEST_WORKERS);
const reuseExistingServer = process.env.PLAYWRIGHT_REUSE_EXISTING_SERVER === "1";
// Opt-in (PLAYWRIGHT_BUILD=production): serve a minified production build through `vite
// preview` so perf specs measure what users run (React prod, no StrictMode double render).
// VITE_PERF_FIXTURES keeps the perf fixtures in that build (src/app/main.tsx); they install
// only behind the "osio:perf" localStorage flag, which perfHarness.bootApp sets.
const productionBuild = process.env.PLAYWRIGHT_BUILD === "production";
const productionOutDir = "test-results/dist-e2e";
const webServerCommand = productionBuild
  ? `NODE_ENV=production VITE_PERF_FIXTURES=true NODE_OPTIONS=--max-old-space-size=3072 pnpm exec vite build --mode test --outDir ${productionOutDir} --emptyOutDir`
    + ` && pnpm exec vite preview --mode test --outDir ${productionOutDir} --host 127.0.0.1 --port ${testPort} --strictPort`
  : `pnpm exec vite --mode test --host 127.0.0.1 --port ${testPort} --strictPort`;
// The build-time legacy second brain gate (src/shared/config/legacySecondBrain.ts), default
// OFF. A default build runs tests/e2e/graph-studio-off; a VITE_LEGACY_SECOND_BRAIN=true build
// (CI's gate-on job) runs the specs that need the legacy view instead.
const legacySecondBrainOn = process.env.VITE_LEGACY_SECOND_BRAIN === "true";
// The perf specs time input -> paint and a busy machine inflates their p95 (perfHarness.mjs):
// they run only through their own runner (`test:e2e:perf`, one worker), never in the
// parallel suite next to other tests.
const perfRun = process.env.PLAYWRIGHT_PERF === "1";
const LEGACY_ON_SPECS = [
  "legacy-second-brain-gate.spec.mjs",
  "legacy-graph-engine-audit.spec.mjs",
  "legacy-graph-engine-visual.spec.mjs",
  "legacy-graph-semantic-zoom.spec.mjs",
];

// Ponytail: PW_CHROMIUM_PATH (set by the browser-tests image built with PW_BROWSER_SOURCE=system)
// runs Debian's Chromium, not the build this Playwright release was tested against, so a
// protocol mismatch can surface as odd failures after a Playwright bump. Escape hatch: the
// default `download` image build.
const chromiumExecutablePath = process.env.PW_CHROMIUM_PATH || undefined;

export default defineConfig({
  testDir: "./tests/e2e",
  testIgnore: [
    ...(legacySecondBrainOn ? ["**/graph-studio-off/**"] : LEGACY_ON_SPECS.map((spec) => `**/${spec}`)),
    ...(perfRun ? [] : ["**/perf/**"]),
  ],
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: {
    timeout: 15_000,
    // Ponytail: a screenshot is compared within a tolerance, so a change that
    // moves fewer than one pixel in a thousand passes unseen. The tolerance is
    // what lets one baseline hold across machines whose text edges differ.
    toHaveScreenshot: { maxDiffPixelRatio: 0.001 },
  },
  workers: configuredWorkers ?? 1,
  shard: parseShard(process.env.PLAYWRIGHT_SHARD),
  outputDir: "test-results/playwright",
  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: "playwright-report" }],
    ["junit", { outputFile: "test-results/junit.xml" }],
  ],
  use: {
    channel: process.env.PLAYWRIGHT_CHANNEL ?? (process.env.CI ? undefined : "chrome"),
    baseURL,
    viewport: { width: 1440, height: 960 },
    locale: "en-US",
    timezoneId: "UTC",
    colorScheme: "light",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    // Playwright's bundled ffmpeg comes from the same blocked CDN, so the system build records no video.
    video: chromiumExecutablePath ? "off" : "retain-on-failure",
    launchOptions: { executablePath: chromiumExecutablePath },
  },
  webServer: {
    command: webServerCommand,
    url: baseURL,
    reuseExistingServer,
    env: {
      ...process.env,
      // Empty = offline build. tests/e2e/functional/sign-out-everywhere.spec.ts needs a bridge
      // origin (it stubs every /api call), so it runs only when this is set to the baseURL.
      VITE_API_URL: process.env.PLAYWRIGHT_API_URL ?? "",
      VITE_ALLOW_OFFLINE_MODE: "true",
      VITE_REQUIRE_BRIDGE_SESSION: "false",
    },
    stdout: "pipe",
    stderr: "pipe",
    timeout: productionBuild ? 900_000 : 60_000,
  },
});
