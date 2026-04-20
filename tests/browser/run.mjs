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

const scenarios = [
  ...blockCreationScenarios,
  ...indentationScenarios,
  ...editingBehaviorScenarios,
  ...contextMenuScenarios,
  ...dragAndDropScenarios,
  ...containerAndPasteScenarios,
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

async function executeScenario(browser, scenario, appUrl) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 960 },
  });
  const page = await context.newPage();
  const startedAt = Date.now();

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

async function main() {
  if (filteredScenarios.length === 0) {
    console.log(colorize(ANSI.yellow, "No browser scenarios match the current TEST_FILTER."));
    return;
  }

  const workerCount = getWorkerCount();
  const startedAt = Date.now();
  const browser = await chromium.launch({ headless: true });
  const server = await startDevServer({ cwd: process.cwd() });
  const results = new Array(filteredScenarios.length);
  let nextScenarioIndex = 0;

  try {
    console.log(
      colorize(
        ANSI.cyan,
        `Running ${filteredScenarios.length} browser scenario(s) with ${workerCount} worker(s)...`,
      ),
    );

    await Promise.all(
      Array.from({ length: workerCount }, async () => {
        while (true) {
          const scenarioIndex = nextScenarioIndex;
          nextScenarioIndex += 1;

          if (scenarioIndex >= filteredScenarios.length) {
            return;
          }

          const result = await executeScenario(
            browser,
            filteredScenarios[scenarioIndex],
            server.url,
          );
          results[scenarioIndex] = result;
          console.log(formatResultLine(result));
        }
      }),
    );
  } finally {
    await server.close();
    await browser.close();
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
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(colorize(ANSI.red, "x Browser test runner crashed."));
  console.error(error);
  process.exit(1);
});
