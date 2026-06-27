/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   codeBlock.spec.mjs                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/05/29 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/05/29 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { test } from "@playwright/test";

import { codeBlockScenarios } from "../../browser/specs/codeBlock.mjs";
import {
  groupBrowserScenarios,
  runBrowserScenario,
  scenarioTitle,
} from "../support/scenarioTestUtils.mjs";

const { parallelScenarios, serialScenarios } = groupBrowserScenarios(codeBlockScenarios);

test.describe("code-block", () => {
  test.describe.configure({ mode: "parallel" });

  for (const scenario of parallelScenarios) {
    test(scenarioTitle(scenario), runBrowserScenario(scenario));
  }
});

test.describe("code-block (serial)", () => {
  test.describe.configure({ mode: "serial" });

  for (const scenario of serialScenarios) {
    test(scenarioTitle(scenario), runBrowserScenario(scenario));
  }
});
