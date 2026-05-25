/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   pageHeaderMenu.mjs                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/05/25 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/05/25 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { expect } from "@playwright/test";

import {
  clickOutside,
  openFreshPage,
  waitForRenderStability,
} from "../core/app.mjs";
import { defineScenario } from "../core/scenario.mjs";

export const pageHeaderMenuScenarios = [
  defineScenario(
    "13. Page header menu",
    "Escape",
    "Escape closes the page settings menu",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      await waitForRenderStability(page);
      await page.getByRole("button", { name: "Open page configuration" }).click();
      await waitForRenderStability(page);

      await expect(page.getByText("Small text")).toBeVisible();

      await page.keyboard.press("Escape");
      await waitForRenderStability(page);

      await expect(page.getByText("Small text")).not.toBeVisible();
    },
  ),

  defineScenario(
    "13. Page header menu",
    "Outside click",
    "Clicking outside closes the page settings menu",
    async ({ page, appUrl }) => {
      await openFreshPage(page, appUrl);
      await waitForRenderStability(page);
      await page.getByRole("button", { name: "Open page configuration" }).click();
      await waitForRenderStability(page);

      await expect(page.getByText("Small text")).toBeVisible();

      await clickOutside(page);
      await waitForRenderStability(page);

      await expect(page.getByText("Small text")).not.toBeVisible();
    },
  ),
];
