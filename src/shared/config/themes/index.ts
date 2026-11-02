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
import obsidianForge from "./obsidian-forge.json" with { type: "json" };
import phosphorTerminal from "./phosphor-terminal.json" with { type: "json" };
import neonTokyo from "./neon-tokyo.json" with { type: "json" };
import velvetNoir from "./velvet-noir.json" with { type: "json" };
import abyssalOcean from "./abyssal-ocean.json" with { type: "json" };
import emberRust from "./ember-rust.json" with { type: "json" };
import auroraBorealis from "./aurora-borealis.json" with { type: "json" };
import mochaRoast from "./mocha-roast.json" with { type: "json" };
import concreteBrutal from "./concrete-brutal.json" with { type: "json" };
import forestCanopy from "./forest-canopy.json" with { type: "json" };
import royalRegalia from "./royal-regalia.json" with { type: "json" };
import blueprint from "./blueprint.json" with { type: "json" };
import swissGrid from "./swiss-grid.json" with { type: "json" };
import sakuraPaper from "./sakura-paper.json" with { type: "json" };
import newsprint from "./newsprint.json" with { type: "json" };
import solarSand from "./solar-sand.json" with { type: "json" };
import nordicFrost from "./nordic-frost.json" with { type: "json" };
import lavenderMist from "./lavender-mist.json" with { type: "json" };
import citrusPop from "./citrus-pop.json" with { type: "json" };
import typewriterLedger from "./typewriter-ledger.json" with { type: "json" };

export const SHIPPED_THEMES: readonly ThemeDoc[] = [harborNight, studioPaper, graphiteCompact, highContrast, meadow, abyssalOcean, auroraBorealis, blueprint, citrusPop, concreteBrutal, emberRust, forestCanopy, lavenderMist, mochaRoast, neonTokyo, newsprint, nordicFrost, obsidianForge, phosphorTerminal, royalRegalia, sakuraPaper, solarSand, swissGrid, typewriterLedger, velvetNoir] as ThemeDoc[];

export function isShippedThemeName(name: string): boolean {
  const wanted = name.trim().toLowerCase();
  return SHIPPED_THEMES.some((theme) => theme.name.toLowerCase() === wanted);
}
