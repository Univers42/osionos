/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   editingBehavior.spec.mjs                           :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/05/18 21:19:22 by dlesieur          #+#    #+#             */
/*   Updated: 2026/05/18 21:19:22 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { test } from "@playwright/test";

import { editingBehaviorScenarios } from "../../browser/specs/editingBehavior.mjs";
import {
  groupBrowserScenarios,
  runBrowserScenario,
  scenarioTitle,
} from "../support/scenarioTestUtils.mjs";

const { parallelScenarios, serialScenarios } = groupBrowserScenarios(editingBehaviorScenarios);

test.describe("editing-behavior", () => {
  test.describe.configure({ mode: "parallel" });

  for (const scenario of parallelScenarios) {
    test(scenarioTitle(scenario), runBrowserScenario(scenario));
  }
});

test.describe("editing-behavior (serial)", () => {
  test.describe.configure({ mode: "serial" });

  for (const scenario of serialScenarios) {
    test(scenarioTitle(scenario), runBrowserScenario(scenario));
  }
});
