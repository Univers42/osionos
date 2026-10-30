import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AXE_PATH = path.resolve(__dirname, "vendor/axe.min.js");

/**
 * Injects axe-core script into the Playwright page.
 *
 * @param {import('@playwright/test').Page} page
 */
export async function injectAxe(page) {
  await page.addScriptTag({ path: AXE_PATH });
}

/**
 * Runs an accessibility audit on the active page using axe-core WCAG 2.2 AA tags.
 * Logs formatted diagnostics for all discovered violations and returns the audit results.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} contextName
 * @param {object} [options]
 * @returns {Promise<{ violations: any[], passes: any[], incomplete: any[] }>}
 */
export async function runA11yAudit(page, contextName, options = {}) {
  const isAxeLoaded = await page.evaluate(() => typeof window.axe !== "undefined");
  if (!isAxeLoaded) {
    await injectAxe(page);
  }

  const tags = options.tags ?? [
    "wcag2a",
    "wcag2aa",
    "wcag21a",
    "wcag21aa",
    "wcag22aa",
  ];

  const axeOptions = {
    runOnly: {
      type: "tag",
      values: tags,
    },
    ...options.axeOptions,
  };

  const results = await page.evaluate(async (opts) => {
    return await window.axe.run(document, opts);
  }, axeOptions);

  const { violations = [], passes = [], incomplete = [] } = results;

  console.log(`\n==================================================`);
  console.log(`[a11y audit] Context: ${contextName}`);
  console.log(`Violations: ${violations.length} | Passes: ${passes.length} | Incomplete: ${incomplete.length}`);
  console.log(`==================================================`);

  if (violations.length > 0) {
    for (const [index, violation] of violations.entries()) {
      const targets = violation.nodes
        ?.map((node) => (Array.isArray(node.target) ? node.target.join(" ") : String(node.target)))
        .join(", ") || "(none)";
      console.log(`  ${index + 1}. [${(violation.impact || "unknown").toUpperCase()}] Rule: ${violation.id}`);
      console.log(`     Description: ${violation.description}`);
      console.log(`     Target: ${targets}`);
      if (violation.helpUrl) {
        console.log(`     Help: ${violation.helpUrl}`);
      }
      if (violation.nodes && violation.nodes.length > 0) {
        for (const [nodeIndex, node] of violation.nodes.entries()) {
          const nodeTarget = Array.isArray(node.target) ? node.target.join(" ") : String(node.target);
          console.log(`     Node ${nodeIndex + 1} [${nodeTarget}]:`);
          if (node.html) {
            console.log(`       HTML: ${node.html}`);
          }
          if (node.failureSummary) {
            console.log(`       Failure: ${node.failureSummary.replace(/\n/g, "\n       ")}`);
          }
        }
      }
    }
    console.log(`--------------------------------------------------\n`);
  }

  return { violations, passes, incomplete };
}
