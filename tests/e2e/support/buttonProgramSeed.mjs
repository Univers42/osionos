/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   buttonProgramSeed.mjs                              :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { explorerRow } from "../../browser/core/app.mjs";

export const BUTTON_WS = "mock-ws-private-0";

// Seeds one page ("Button host") whose content is `buttons`, once per tab
// (sessionStorage guard) so a reload reads back what the app saved.
export async function seedButtonPage(page, baseURL, buttons, properties = []) {
  await page.addInitScript(({ buttons, properties, ws }) => {
    if (sessionStorage.getItem("button-seeded") !== null) return;
    sessionStorage.setItem("button-seeded", "1");
    const base = { workspaceId: ws, ownerId: "mock-user-0", visibility: "private", collaborators: [], parentPageId: null, databaseId: null, archivedAt: null };
    localStorage.setItem(`osio:pages:${ws}`, JSON.stringify([{ ...base, _id: "btn-host", title: "Button host", properties, content: buttons }]));
    localStorage.setItem("pg:recents", "[]");
  }, { buttons, properties, ws: BUTTON_WS });
  await page.goto(baseURL, { waitUntil: "domcontentloaded" });
  await explorerRow(page, "Button host").click();
  await page.evaluate(() => globalThis.__playgroundUserStore.setState({ activePageJwt: () => "e2e-page-jwt" }));
}
