/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   rgaaFacts.spec.mjs                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/30 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/30 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The measurable half of the manual RGAA pass (#224): on each audited surface it records
// the facts a human auditor reads off the page — language, title, headings, landmarks,
// the skip link, the keyboard tab walk and its visible focus, reflow at 320 px, text
// spacing and frame titles — into rgaa-facts-<surface>.json.
// Caveat: a fact is not a verdict. "Focus visible" compares the focused element's
// outline/box-shadow/background with its unfocused style, so a focus shown only by a
// sibling or a parent reads as invisible (over-reports); a clip is only detected when
// the element itself hides overflow (under-reports clipping by an ancestor), and a 1 px
// box is taken for visually-hidden text (an sr-only node is clipped on purpose).

import { test } from "@playwright/test";
import { writeFile } from "node:fs/promises";

import { createParagraphs, openFreshPage } from "../../browser/core/app.mjs";
import { insertInlineDatabase } from "../support/databaseHelpers.mjs";

const TAB_WALK = 60;

const SURFACES = {
  editor: async (page, baseURL) => {
    await openFreshPage(page, baseURL);
    await createParagraphs(page, ["First paragraph", "Second paragraph"]);
  },
  settings: async (page, baseURL) => {
    await openFreshPage(page, baseURL);
    await page.getByRole("button", { name: /settings/i }).first().click();
    await page.getByRole("button", { name: "Preferences" }).waitFor();
  },
  chat: async (page, baseURL) => {
    await openFreshPage(page, baseURL);
    await page.getByRole("tab", { name: "Conversations" }).click();
    await page.waitForTimeout(500);
  },
  database: async (page) => {
    const block = await insertInlineDatabase(page);
    await block.locator('[aria-label="Add property"]').waitFor();
  },
};

/** Static facts read from the DOM in one pass. */
function documentFacts() {
  const named = (el) => el.getAttribute("aria-label") || el.getAttribute("aria-labelledby") || "";
  const landmark = (selector) => [...document.querySelectorAll(selector)].map((el) => named(el) || el.tagName.toLowerCase());
  return {
    doctype: document.doctype?.name ?? null,
    lang: document.documentElement.lang,
    title: document.title,
    headings: [...document.querySelectorAll("h1,h2,h3,h4,h5,h6,[role=heading]")]
      .filter((el) => el.getClientRects().length > 0)
      .map((el) => `${el.getAttribute("aria-level") ? `h${el.getAttribute("aria-level")}` : el.tagName.toLowerCase()} ${el.textContent.trim().slice(0, 40)}`),
    landmarks: {
      main: landmark("main,[role=main]"),
      nav: landmark("nav,[role=navigation]"),
      banner: landmark("header,[role=banner]"),
      complementary: landmark("aside,[role=complementary]"),
      contentinfo: landmark("footer,[role=contentinfo]"),
      region: landmark("section[aria-label],section[aria-labelledby],[role=region]"),
    },
    frames: [...document.querySelectorAll("iframe")].map((el) => el.title || "(no title)"),
    imagesWithoutAlt: [...document.querySelectorAll("img:not([alt])")].length,
    autocomplete: [...document.querySelectorAll("input")].map((el) => `${el.type}:${el.autocomplete || "-"}`),
    statusRegions: document.querySelectorAll("[role=status],[role=alert],[aria-live]").length,
  };
}

/** Description of the focused element and whether its focus style differs from rest. */
function focusedFacts() {
  const el = document.activeElement;
  if (!el || el === document.body) return null;
  const style = getComputedStyle(el);
  const ring = `${style.outlineStyle}|${style.outlineWidth}|${style.boxShadow}|${style.backgroundColor}|${style.borderColor}`;
  const name = (el.getAttribute("aria-label") || el.textContent || el.getAttribute("placeholder") || "").trim().slice(0, 30);
  return { key: `${el.tagName.toLowerCase()}[${el.getAttribute("role") ?? ""}] ${name}`, ring, path: el.id || el.className?.toString().slice(0, 40) };
}

async function tabWalk(page) {
  await page.mouse.click(1, 1);
  await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur());
  const steps = [];
  for (let i = 0; i < TAB_WALK; i += 1) {
    await page.keyboard.press("Tab");
    const focused = await page.evaluate(focusedFacts);
    if (!focused) { steps.push({ key: "(body)", visible: false }); continue; }
    const restRing = await page.evaluate(() => {
      const el = document.activeElement;
      el.setAttribute("data-rgaa-probe", "");
      const clone = el.cloneNode(false);
      clone.removeAttribute("id");
      el.parentElement.appendChild(clone);
      const style = getComputedStyle(clone);
      const ring = `${style.outlineStyle}|${style.outlineWidth}|${style.boxShadow}|${style.backgroundColor}|${style.borderColor}`;
      clone.remove();
      el.removeAttribute("data-rgaa-probe");
      return ring;
    });
    steps.push({ key: focused.key, visible: focused.ring !== restRing });
  }
  const keys = steps.map((step) => step.key);
  const tail = keys.slice(-10);
  return {
    first: steps.slice(0, 8).map((step) => step.key),
    reached: new Set(keys).size,
    invisibleFocus: [...new Set(steps.filter((step) => !step.visible).map((step) => step.key))],
    trapped: new Set(tail).size === 1 && tail[0] !== "(body)",
  };
}

async function reflowFacts(page, surface) {
  await page.setViewportSize({ width: 320, height: 256 });
  await page.waitForTimeout(300);
  await page.screenshot({ path: test.info().outputPath(`reflow-${surface}.png`) });
  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  await page.setViewportSize({ width: 1280, height: 720 });
  return overflow;
}

async function textSpacingFacts(page) {
  await page.addStyleTag({ content: "* { line-height: 1.5 !important; letter-spacing: 0.12em !important; word-spacing: 0.16em !important; } p { margin-bottom: 2em !important; }" });
  await page.waitForTimeout(200);
  return page.evaluate(() => [...document.querySelectorAll("body *")]
    .filter((el) => el.children.length === 0 && el.textContent.trim() && el.getClientRects().length > 0 && el.clientWidth > 1)
    .filter((el) => {
      const style = getComputedStyle(el);
      const clips = style.overflow === "hidden" || style.overflowY === "hidden" || style.overflowX === "hidden";
      return clips && style.textOverflow !== "ellipsis" && (el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1);
    })
    .slice(0, 15)
    .map((el) => `${el.tagName.toLowerCase()} "${el.textContent.trim().slice(0, 30)}"`));
}

for (const [surface, open] of Object.entries(SURFACES)) {
  test(`RGAA facts: ${surface}`, async ({ page, baseURL }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 1280, height: 720 });
    await open(page, baseURL);
    const facts = { surface, document: await page.evaluate(documentFacts) };
    facts.keyboard = await tabWalk(page);
    facts.reflow = await reflowFacts(page, surface);
    facts.textSpacingClipped = await textSpacingFacts(page);
    await writeFile(test.info().outputPath(`rgaa-facts-${surface}.json`), JSON.stringify(facts, null, 2));
  });
}
