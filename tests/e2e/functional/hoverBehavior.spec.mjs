/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   hoverBehavior.spec.mjs                             :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: vjan-nie <vjan-nie@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/05/25 00:00:00 by vjan-nie          #+#    #+#             */
/*   Updated: 2026/05/25 00:00:00 by vjan-nie         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { test } from "@playwright/test";

import { hoverBehaviorScenarios } from "../../browser/specs/hoverBehavior.mjs";
import {
  groupBrowserScenarios,
  runBrowserScenario,
  scenarioTitle,
} from "../support/scenarioTestUtils.mjs";

const { parallelScenarios, serialScenarios } = groupBrowserScenarios(hoverBehaviorScenarios);

test.describe("hover-isolation", () => {
  test.describe.configure({ mode: "parallel" });

  for (const scenario of parallelScenarios) {
    test(scenarioTitle(scenario), runBrowserScenario(scenario));
  }
});

test.describe("hover-isolation (serial)", () => {
  test.describe.configure({ mode: "serial" });

  for (const scenario of serialScenarios) {
    test(scenarioTitle(scenario), runBrowserScenario(scenario));
  }
});
