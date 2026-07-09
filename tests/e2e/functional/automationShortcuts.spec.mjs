/* ************************************************************************** */
/*  automationShortcuts.spec.mjs — shortcut manager + dispatcher (e2e)        */
/* ************************************************************************** */

import { test } from "@playwright/test";

import { automationShortcutsScenarios } from "../../browser/specs/automationShortcuts.mjs";
import {
  groupBrowserScenarios,
  runBrowserScenario,
  scenarioTitle,
} from "../support/scenarioTestUtils.mjs";

const { parallelScenarios, serialScenarios } = groupBrowserScenarios(automationShortcutsScenarios);

test.describe("automation-shortcuts", () => {
  test.describe.configure({ mode: "parallel" });

  for (const scenario of parallelScenarios) {
    test(scenarioTitle(scenario), runBrowserScenario(scenario));
  }
});

test.describe("automation-shortcuts (serial)", () => {
  test.describe.configure({ mode: "serial" });

  for (const scenario of serialScenarios) {
    test(scenarioTitle(scenario), runBrowserScenario(scenario));
  }
});
