/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   discoveredSections.ts                              :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/23 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/23 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { AdminSection } from "./adminSections";

// One lazy loader per `sections/<id>/section.ts`: a package adds a section by creating that
// file and touching nothing else. Each section's body stays its own chunk via `load`.
const modules = import.meta.glob<{ section: AdminSection }>("../sections/*/section.ts", { eager: false });

/** Every discovered section, in path order. Caveat: a `section.ts` that fails to load is
 *  skipped silently so one broken section cannot take the whole space down; its nav entry
 *  is then simply absent. */
export async function loadDiscoveredSections(): Promise<AdminSection[]> {
  const loaded = await Promise.all(
    Object.keys(modules).sort((a, b) => (a < b ? -1 : Number(a > b))).map((path) => modules[path]().then((m) => m.section, () => null)),
  );
  return loaded.filter((section): section is AdminSection => section !== null);
}
