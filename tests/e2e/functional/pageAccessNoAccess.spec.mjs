/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   pageAccessNoAccess.spec.mjs                        :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/28 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/28 00:00:00 by dlesieur          #+#    #+#             */
/*                                                                            */
/* ************************************************************************** */

import { expect, test } from "@playwright/test";

import { openFreshPage } from "../../browser/core/app.mjs";

const UNREADABLE_PAGE_ID = "12345678-1234-4234-8234-123456789abc";

test.describe("no-access screen", () => {
  test("shows the same screen for an unreadable page link", async ({ page, baseURL }) => {
    await page.goto(new URL(`/?page=${UNREADABLE_PAGE_ID}`, baseURL).toString());
    await expect(page.getByRole("heading", { name: "You don't have access to this page" })).toBeVisible();
    await expect(page.getByText("Ask the page owner for access.")).toBeVisible();
  });
});