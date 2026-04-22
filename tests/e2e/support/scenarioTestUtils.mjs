import { formatScenarioLabel } from "../../browser/core/scenario.mjs";

export function groupBrowserScenarios(scenarios) {
  const browserScenarios = scenarios.filter((scenario) => scenario.needsBrowser !== false);
  return {
    parallelScenarios: browserScenarios.filter((scenario) => !scenario.serial),
    serialScenarios: browserScenarios.filter((scenario) => scenario.serial),
  };
}

export function scenarioTitle(scenario) {
  return formatScenarioLabel(scenario);
}

export function runBrowserScenario(scenario) {
  return async ({ page, context, browser, baseURL }) => {
    if (!baseURL) {
      throw new Error("Playwright baseURL is not configured.");
    }

    await scenario.run({
      page,
      context,
      browser,
      appUrl: baseURL,
    });
  };
}
