import process from "node:process";
import { chromium } from "playwright";

import { startDevServer } from "./core/devServer.mjs";
import { formatScenarioLabel } from "./core/scenario.mjs";
import { blockCreationScenarios } from "./specs/blockCreation.mjs";
import { inlineToolbarScenarios } from "./specs/inlineToolbar.mjs";
import { assetScenarios } from "./specs/assets.mjs";

const scenarios = [
  ...blockCreationScenarios,
  ...inlineToolbarScenarios,
  ...assetScenarios,
];
const testFilter = process.env.TEST_FILTER?.trim().toLowerCase() ?? "";
const filteredScenarios = testFilter
  ? scenarios.filter((scenario) =>
      `${scenario.type} ${scenario.subtype} ${scenario.action}`
        .toLowerCase()
        .includes(testFilter),
    )
  : scenarios;

async function main() {
  const browser = await chromium.launch({ headless: true });
  const server = await startDevServer({ cwd: process.cwd() });
  const results = [];

  try {
    for (const scenario of filteredScenarios) {
      const context = await browser.newContext({
        viewport: { width: 1440, height: 960 },
      });
      const page = await context.newPage();
      const startedAt = Date.now();

      try {
        await scenario.run({ browser, context, page, appUrl: server.url });
        const durationMs = Date.now() - startedAt;
        results.push({ scenario, status: "PASS", durationMs });
        console.log(`PASS ${formatScenarioLabel(scenario)} (${durationMs}ms)`);
      } catch (error) {
        const durationMs = Date.now() - startedAt;
        const reason =
          error instanceof Error ? error.message.split("\n")[0] : String(error);
        results.push({ scenario, status: "FAIL", durationMs, reason });
        console.log(
          `FAIL ${formatScenarioLabel(scenario)} (${durationMs}ms) -> ${reason}`,
        );
      } finally {
        await context.close();
      }
    }
  } finally {
    await server.close();
    await browser.close();
  }

  const passed = results.filter((result) => result.status === "PASS").length;
  const failed = results.length - passed;
  console.log(
    `\nSummary: ${passed}/${results.length} passed, ${failed}/${results.length} failed.`,
  );

  if (failed > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
