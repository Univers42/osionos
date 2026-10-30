// ************************************************************************** //
//                                                                            //
//                                                        :::      ::::::::   //
//   dockCitations.spec.mjs                             :+:      :+:    :+:   //
//                                                    +:+ +:+         +:+     //
//   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        //
//                                                +#+#+#+#+#+   +#+           //
//   Created: 2026/10/30 00:00:00 by dlesieur          #+#    #+#             //
//   Updated: 2026/10/30 00:00:00 by dlesieur         ###   ########.fr       //
//                                                                            //
// ************************************************************************** //

// #84: the dock's answer showed a bare "[1]"; it marks each cited source and lists them
// under the answer, as the Assistant pane does.

import { expect, test } from "@playwright/test";

test("the dock's answer marks its cited sources and lists them (#84)", async ({ page }, testInfo) => {
  await page.goto("/tests/browser/dockAnswerHarness.html", { waitUntil: "domcontentloaded" });
  const dock = page.getByTestId("dock-answer");
  await dock.waitFor();
  await dock.screenshot({ path: testInfo.outputPath("dock-answer.png") });

  await expect(dock.getByRole("button", { name: "Source 1: Q3 report", exact: true })).toBeVisible();
  await expect(dock.getByRole("link", { name: "Source 2: example.com", exact: true })).toBeVisible();
  await expect(dock.getByTestId("chat-sources")).toBeVisible();
  await expect(dock.getByText("[1]")).toHaveCount(0);
});
