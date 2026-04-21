import process from "node:process";
import { availableParallelism } from "node:os";
import { chromium } from "playwright";

import { startDevServer } from "./core/devServer.mjs";
import { formatScenarioLabel } from "./core/scenario.mjs";
import { blockCreationScenarios } from "./specs/blockCreation.mjs";
import { inlineToolbarScenarios } from "./specs/inlineToolbar.mjs";
import { assetScenarios } from "./specs/assets.mjs";
import { indentationScenarios } from "./specs/indentation.mjs";
import { editingBehaviorScenarios } from "./specs/editingBehavior.mjs";
import { contextMenuScenarios } from "./specs/contextMenu.mjs";
import { dragAndDropScenarios } from "./specs/dragAndDrop.mjs";
import { containerAndPasteScenarios } from "./specs/containersAndPaste.mjs";
import { categoryRegistryScenarios } from "./specs/categoryRegistry.mjs";
import { harnessCoverageScenarios } from "./specs/harnessCoverage.mjs";
import { focusManagementScenarios } from "./specs/focusManagement.mjs";
import { persistenceAndQualityScenarios } from "./specs/persistenceAndQuality.mjs";

const scenarios = [
  ...blockCreationScenarios,
  ...indentationScenarios,
  ...editingBehaviorScenarios,
  ...contextMenuScenarios,
  ...dragAndDropScenarios,
  ...containerAndPasteScenarios,
  ...categoryRegistryScenarios,
  ...focusManagementScenarios,
  ...inlineToolbarScenarios,
  ...assetScenarios,
  ...harnessCoverageScenarios,
  ...persistenceAndQualityScenarios,
];
const testFilter = process.env.TEST_FILTER?.trim().toLowerCase() ?? "";
const filteredScenarios = testFilter
  ? scenarios.filter((scenario) =>
      `${scenario.type} ${scenario.subtype} ${scenario.action}`
        .toLowerCase()
        .includes(testFilter),
    )
  : scenarios;

const ANSI = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  cyan: "\x1b[36m",
  yellow: "\x1b[33m",
  dim: "\x1b[2m",
};

const DEFAULT_WORKERS = Math.max(
  1,
  Math.min(4, availableParallelism() > 1 ? availableParallelism() - 1 : 1),
);

function colorize(color, value) {
  return `${color}${value}${ANSI.reset}`;
}

function parseWorkerCount(value) {
  if (!value) {
    return null;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return null;
  }

  return parsed;
}

function getWorkerCount() {
  const requested = parseWorkerCount(process.env.TEST_WORKERS);
  const desired = requested ?? DEFAULT_WORKERS;
  return Math.max(1, Math.min(desired, Math.max(filteredScenarios.length, 1)));
}

function formatResultLine(result) {
  const symbol = result.status === "PASS" ? "✓" : "x";
  const color = result.status === "PASS" ? ANSI.green : ANSI.red;
  const duration = colorize(ANSI.dim, `(${result.durationMs}ms)`);
  const label = formatScenarioLabel(result.scenario);

  if (result.status === "PASS") {
    return `${colorize(color, symbol)} ${colorize(color, label)} ${duration}`;
  }

  return `${colorize(color, symbol)} ${colorize(color, label)} ${duration} ${colorize(ANSI.red, `-> ${result.reason}`)}`;
}

function formatFailureSummary(results) {
  const failures = results.filter((result) => result.status === "FAIL");
  if (failures.length === 0) {
    return "";
  }

  const lines = failures.map((result, index) => {
    return `  ${index + 1}. ${formatScenarioLabel(result.scenario)}\n     ${result.reason}`;
  });

  return [
    "",
    colorize(ANSI.red, "Failed Scenarios:"),
    ...lines,
  ].join("\n");
}

async function executeScenario(browser, scenario, appUrl) {
  const startedAt = Date.now();

  if (!scenario.needsBrowser) {
    try {
      await scenario.run({ appUrl });
      return {
        scenario,
        status: "PASS",
        durationMs: Date.now() - startedAt,
      };
    } catch (error) {
      return {
        scenario,
        status: "FAIL",
        durationMs: Date.now() - startedAt,
        reason: error instanceof Error ? error.message.split("\n")[0] : String(error),
      };
    }
  }

  if (!browser) {
    throw new Error("Browser scenario execution requires a browser instance");
  }

  const context = await browser.newContext({
    viewport: { width: 1440, height: 960 },
  });
  const page = await context.newPage();

  try {
    await scenario.run({ browser, context, page, appUrl });
    return {
      scenario,
      status: "PASS",
      durationMs: Date.now() - startedAt,
    };
  } catch (error) {
    return {
      scenario,
      status: "FAIL",
      durationMs: Date.now() - startedAt,
      reason: error instanceof Error ? error.message.split("\n")[0] : String(error),
    };
  } finally {
    await context.close();
  }
}

async function runParallelScenarioItems(items, browser, appUrl, workerCount, results) {
  let nextScenarioIndex = 0;

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (true) {
        const itemIndex = nextScenarioIndex;
        nextScenarioIndex += 1;

        if (itemIndex >= items.length) {
          return;
        }

        const item = items[itemIndex];
        const result = await executeScenario(browser, item.scenario, appUrl);
        results[item.index] = result;
        console.log(formatResultLine(result));
      }
    }),
  );
}

async function main() {
  if (filteredScenarios.length === 0) {
    console.log(colorize(ANSI.yellow, "No browser scenarios match the current TEST_FILTER."));
    return;
  }

  const indexedScenarios = filteredScenarios.map((scenario, index) => ({
    scenario,
    index,
  }));
  const parallelBrowserItems = indexedScenarios.filter(
    (item) => item.scenario.needsBrowser && !item.scenario.serial,
  );
  const serialBrowserItems = indexedScenarios.filter(
    (item) => item.scenario.needsBrowser && item.scenario.serial,
  );
  const commandItems = indexedScenarios.filter((item) => !item.scenario.needsBrowser);
  const browserItemCount = parallelBrowserItems.length + serialBrowserItems.length;
  const workerCount = getWorkerCount();
  const startedAt = Date.now();
  let browser = null;
  let server = null;
  const results = new Array(filteredScenarios.length);

  try {
    console.log(
      colorize(
        ANSI.cyan,
        `Running ${filteredScenarios.length} scenario(s) with ${workerCount} worker(s)...`,
      ),
    );

    if (browserItemCount > 0) {
      browser = await chromium.launch({ headless: true });
      server = await startDevServer({ cwd: process.cwd() });

      if (parallelBrowserItems.length > 0) {
        await runParallelScenarioItems(
          parallelBrowserItems,
          browser,
          server.url,
          Math.min(workerCount, parallelBrowserItems.length),
          results,
        );
      }

      for (const item of serialBrowserItems) {
        const result = await executeScenario(browser, item.scenario, server.url);
        results[item.index] = result;
        console.log(formatResultLine(result));
      }
    }

    for (const item of commandItems) {
      const result = await executeScenario(null, item.scenario, null);
      results[item.index] = result;
      console.log(formatResultLine(result));
    }
  } finally {
    await server?.close();
    await browser?.close();
  }

  const completedResults = results.filter(Boolean);
  const passed = completedResults.filter((result) => result.status === "PASS").length;
  const failed = completedResults.length - passed;
  const totalDurationMs = Date.now() - startedAt;

  const summaryColor = failed > 0 ? ANSI.red : ANSI.green;
  const summarySymbol = failed > 0 ? "x" : "✓";

  console.log(
    `\n${colorize(
      summaryColor,
      `${summarySymbol} Summary: ${passed}/${completedResults.length} passed, ${failed}/${completedResults.length} failed.`,
    )} ${colorize(ANSI.dim, `(${totalDurationMs}ms total)`)}`
  );

  if (failed > 0) {
    console.log(formatFailureSummary(completedResults));
  }

  if (failed > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(colorize(ANSI.red, "x Browser test runner crashed."));
  console.error(error);
  process.exit(1);
});
