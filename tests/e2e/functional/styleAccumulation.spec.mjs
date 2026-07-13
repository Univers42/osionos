/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   styleAccumulation.spec.mjs                         :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/12 15:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/12 15:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Styles ACCUMULATE rather than replace one another:
//  - inline sugar syntax stacks marks (bold + italic + underline …)
//  - "/color" and "/background" both stick on the same block.

import { expect, test } from "@playwright/test";

import { activateFirstEditor, openFreshPage } from "../../browser/core/app.mjs";

const RED = "rgb(239, 68, 68)";
const BLUE = "rgb(59, 130, 246)";

/** Tags wrapping the typed word, outermost first (e.g. ["EM","STRONG"]). */
async function markChain(page) {
  return page.evaluate(() => {
    const ce = document.querySelector(".osionos-page [data-block-id] [contenteditable]");
    const chain = [];
    let node = ce?.querySelector("strong, em, u, del, mark");
    while (node) {
      chain.push(node.tagName);
      node = node.querySelector("strong, em, u, del, mark");
    }
    return chain;
  });
}

async function typeInFreshBlock(page, baseURL, text) {
  await openFreshPage(page, baseURL);
  const editor = await activateFirstEditor(page);
  await editor.click();
  await page.keyboard.type(text);
  await page.waitForTimeout(500);
}

const STACKS = [
  { typed: "***hello***", marks: ["EM", "STRONG"] },
  { typed: "**__hello__**", marks: ["STRONG", "U"] },
  { typed: "__**hello**__", marks: ["U", "STRONG"] },
  { typed: "~~**hello**~~", marks: ["DEL", "STRONG"] },
  { typed: "***__hello__***", marks: ["EM", "STRONG", "U"] },
];

test.describe("inline sugar syntax stacks marks", () => {
  for (const { typed, marks } of STACKS) {
    test(`${typed} -> ${marks.join(" > ")}`, async ({ page, baseURL }) => {
      await typeInFreshBlock(page, baseURL, typed);
      expect(await markChain(page)).toEqual(marks);
    });
  }
});

test("/color and /background accumulate on one block", async ({ page, baseURL }) => {
  await typeInFreshBlock(page, baseURL, "hello");
  for (const command of ["/color red", "/background blue"]) {
    await page.keyboard.type(command);
    await page.waitForTimeout(300);
    await page.keyboard.press("Enter");
    await page.waitForTimeout(300);
  }

  const applied = await page.evaluate(() => {
    const wrapper = document.querySelector(
      '.osionos-page [data-block-id][data-block-type="paragraph"]',
    );
    const editable = wrapper?.querySelector("[contenteditable]");
    return {
      surface: wrapper ? getComputedStyle(wrapper).backgroundColor : null,
      text: editable ? getComputedStyle(editable).color : null,
    };
  });

  // Both stick — setting a background used to silently replace the chosen text
  // colour with a contrast-safe default, making the two commands exclusive.
  expect(applied).toEqual({ surface: BLUE, text: RED });
});
