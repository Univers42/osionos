/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   inlineMarkCaret.spec.mjs                           :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/05/25 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/05/25 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { test } from "@playwright/test";

import { inlineMarkCaretScenarios } from "../../browser/specs/inlineMarkCaret.mjs";
import {
  groupBrowserScenarios,
  runBrowserScenario,
  scenarioTitle,
} from "../support/scenarioTestUtils.mjs";

const { parallelScenarios, serialScenarios } =
  groupBrowserScenarios(inlineMarkCaretScenarios);

test.describe("inline-mark-caret", () => {
  test.describe.configure({ mode: "parallel" });

  for (const scenario of parallelScenarios) {
    test(scenarioTitle(scenario), runBrowserScenario(scenario));
  }
});

test.describe("inline-mark-caret (serial)", () => {
  test.describe.configure({ mode: "serial" });

  for (const scenario of serialScenarios) {
    test(scenarioTitle(scenario), runBrowserScenario(scenario));
  }
});
