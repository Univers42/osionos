import { test } from "@playwright/test";

import { focusManagementScenarios } from "../../browser/specs/focusManagement.mjs";
import {
  groupBrowserScenarios,
  runBrowserScenario,
  scenarioTitle,
} from "../support/scenarioTestUtils.mjs";

const { parallelScenarios, serialScenarios } = groupBrowserScenarios(focusManagementScenarios);

test.describe("focus-management", () => {
  test.describe.configure({ mode: "parallel" });

  for (const scenario of parallelScenarios) {
    test(scenarioTitle(scenario), runBrowserScenario(scenario));
  }
});

test.describe("focus-management (serial)", () => {
  test.describe.configure({ mode: "serial" });

  for (const scenario of serialScenarios) {
    test(scenarioTitle(scenario), runBrowserScenario(scenario));
  }
});
