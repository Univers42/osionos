/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   peopleHovercards.spec.mjs                      :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/23 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/23 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */


// Offline build: no bridge, so follow, presence and status are covered by the canvas tests
// (tests/canvas/people-social-model.test.ts). This spec pins what the browser owns: when the
// card opens and closes, that it is reachable from the keyboard, and that every social
// control stays out of sight without a bridge instead of erroring.

import { expect, test } from "@playwright/test";

import { openFreshPage } from "../../browser/core/app.mjs";
import { SEEDED_PEER, openSeededPerson, seedContact } from "../support/peopleSeed.mjs";

const card = (page) => page.getByRole("dialog", { name: `${SEEDED_PEER.name}, profile` });

test.describe("people hovercards (offline build)", () => {
  test("hovercards on: hover opens the card, Escape closes it", async ({ page, baseURL }) => {
    await seedContact(page);
    await openFreshPage(page, baseURL);
    const name = await openSeededPerson(page);
    await name.hover();
    await expect(card(page)).toBeVisible();
    await expect(card(page).getByText(SEEDED_PEER.headline)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(card(page)).toHaveCount(0);
  });

  test("hovercards off: hover opens nothing, focus and click do", async ({ page, baseURL }) => {
    await seedContact(page, { hovercards: "off" });
    await openFreshPage(page, baseURL);
    const name = await openSeededPerson(page);
    await name.hover();
    await page.waitForTimeout(500);
    await expect(card(page)).toHaveCount(0);
    await name.focus();
    await expect(card(page)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(card(page)).toHaveCount(0);
    await name.click();
    await expect(card(page)).toBeVisible();
  });

  test("no bridge: no follow button, no presence editor, no console error", async ({ page, baseURL }) => {
    const errors = [];
    page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
    await seedContact(page);
    await openFreshPage(page, baseURL);
    const name = await openSeededPerson(page);
    await name.focus();
    await expect(card(page)).toBeVisible();
    await expect(card(page).getByRole("button", { name: /Follow/ })).toHaveCount(0);
    await expect(page.getByRole("combobox", { name: "Presence", exact: true })).toHaveCount(0);
    expect(errors).toEqual([]);
  });
});
