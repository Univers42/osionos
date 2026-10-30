/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   aiMermaidBlock.spec.mjs                            :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/30 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/30 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// #34: the assistant's add_blocks writes `{ type: "code", content, language: "mermaid" }`
// (services/osionos-ai/tests/addBlocks.test.ts pins the stored shape). This checks the
// other half: that exact block, on a page, is a drawn diagram — and without the language
// (what add_blocks stored before #34) it stays source text.

import { test, expect } from "@playwright/test";

import { seedPage } from "../support/embedSeed.mjs";

const SOURCE = "flowchart TD\n  Idea --> Draft\n  Draft --> Review\n  Review --> Published";
const card = (page) => page.locator(".osio-code-card").first();
// Mermaid marks its own svg with a role description; toolbar icons are svgs too.
const drawn = (page) => card(page).locator("svg[aria-roledescription]");

test("a mermaid code block written by the assistant is a drawn diagram", async ({ page, baseURL }, testInfo) => {
  await seedPage(page, baseURL, [{ id: "ai-diagram", type: "code", content: SOURCE, language: "mermaid" }]);
  const diagram = drawn(page);
  await expect(diagram).toBeVisible();
  await expect(diagram).toContainText("Published");
  await card(page).screenshot({ path: testInfo.outputPath("after-mermaid-block.png") });
});

test("the same block without its language stays source text, not a diagram", async ({ page, baseURL }, testInfo) => {
  await seedPage(page, baseURL, [{ id: "ai-diagram", type: "code", content: SOURCE }]);
  await expect(card(page)).toContainText("Review --> Published");
  await expect(drawn(page)).toHaveCount(0);
  await card(page).screenshot({ path: testInfo.outputPath("before-code-block.png") });
});
