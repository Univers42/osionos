/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   index.ts                                           :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/26 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/26 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The themes osionos ships. They are plain JSON so they read exactly like a
// theme a person writes, and are held to the catalog and to AA contrast by
// tests/canvas/theme-shipped.test.ts. Read-only: "Duplicate" copies one into
// the person's own library.

import type { ThemeDoc } from "../themeDoc";

import graphiteCompact from "./graphite-compact.json" with { type: "json" };
import harborNight from "./harbor-night.json" with { type: "json" };
import highContrast from "./high-contrast.json" with { type: "json" };
import meadow from "./meadow.json" with { type: "json" };
import studioPaper from "./studio-paper.json" with { type: "json" };

export const SHIPPED_THEMES: readonly ThemeDoc[] = [harborNight, studioPaper, graphiteCompact, highContrast, meadow] as ThemeDoc[];

export function isShippedThemeName(name: string): boolean {
  const wanted = name.trim().toLowerCase();
  return SHIPPED_THEMES.some((theme) => theme.name.toLowerCase() === wanted);
}
