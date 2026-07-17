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

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  timeout: 30_000,
  expect: {
    timeout: 10_000,
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
    baseURL,
    viewport: { width: 1440, height: 960 },
    locale: "en-US",
    timezoneId: "UTC",
    colorScheme: "light",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  webServer: {
    command: `VITE_API_URL= VITE_ALLOW_OFFLINE_MODE=true VITE_REQUIRE_BRIDGE_SESSION=false pnpm exec vite --mode test --host 127.0.0.1 --port ${testPort} --strictPort`,
    url: baseURL,
    reuseExistingServer,
    env: {
      ...process.env,
      VITE_API_URL: "",
      VITE_ALLOW_OFFLINE_MODE: "true",
      VITE_REQUIRE_BRIDGE_SESSION: "false",
    },
    stdout: "pipe",
    stderr: "pipe",
    timeout: 60_000,
  },
});
