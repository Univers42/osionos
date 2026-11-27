/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   viewMenu.mjs                                       :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/27 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/27 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/** Run a View › Appearance row from the title bar's menubar, the way a user does. */
export async function chooseViewAppearance(page, rowName) {
  await page.getByTestId("app-topbar").getByRole("button", { name: "View", exact: true }).click();
  await page.getByRole("menuitem", { name: "Appearance" }).click();
  await page.getByRole("menuitem", { name: rowName }).click();
}
