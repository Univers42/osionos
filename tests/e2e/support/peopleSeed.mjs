/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   peopleSeed.mjs                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/23 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/23 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */


// Offline Playwright build: no bridge, so a person card is exercised from a contact seeded
// into the persisted contacts store (the same key the store rehydrates from). One copy
// here for every spec that needs a person on screen.

import { expect } from "@playwright/test";

import { openSettings } from "./settingsHelpers.mjs";

export const SEEDED_PEER = { id: "11111111-1111-4111-8111-111111111111", name: "Grace Hopper", headline: "Rear admiral", avatar: null };

export async function seedContact(page, appearance) {
  await page.addInitScript(({ peer, raw }) => {
    if (sessionStorage.getItem("people-seeded")) return;
    sessionStorage.setItem("people-seeded", "1");
    const edge = { id: "edge-1", peer, status: "accepted", direction: "outgoing", introMessage: null, createdAt: "2026-10-01T00:00:00.000Z" };
    localStorage.setItem("osionos:social:contacts", JSON.stringify({ state: { data: [edge], requests: [] }, version: 0 }));
    localStorage.setItem("osionos:theme-mode", "light");
    if (raw) localStorage.setItem("osionos:appearance", raw);
  }, { peer: SEEDED_PEER, raw: appearance ? JSON.stringify(appearance) : null });
}

/** Opens Settings on Contacts and returns the seeded person's name button. */
export async function openSeededPerson(page) {
  await openSettings(page, "Contacts");
  const name = page.getByRole("button", { name: SEEDED_PEER.name, exact: true });
  await expect(name).toBeVisible();
  return name;
}
