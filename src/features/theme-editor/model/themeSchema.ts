/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   themeSchema.ts                                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/26 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/26 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The JSON schema the theme editor validates and completes against, built from
// the token catalog so it can never list a token the parser would refuse.
// Rebuilt as values change: each token's hover shows what it paints and its
// value now.

import { THEME_BASES, THEME_LIMITS } from "../../../../scripts/bridge-theme-rules.mjs";

import { PALETTES } from "@/shared/config/theme";
import { THEME_TOKENS, type ThemeGroup, type ThemeToken } from "@/shared/config/themeTokens";

const GROUP_DESCRIPTIONS: Record<ThemeGroup, string> = {
  colors: "Colours: backgrounds, text, borders, accent, status, block tints, charts and code.",
  layout: "Sizes and shapes: spacing, corners, control heights, widths, shadows and motion.",
  fonts: "Font families, sizes, weights, line heights and letter spacing.",
};

function tokenSchema(token: ThemeToken, now: string) {
  return {
    type: "string",
    maxLength: THEME_LIMITS.valueMax,
    description: token.description,
    markdownDescription: `${token.description} (${token.kind})\n\nNow: \`${now || "not set"}\``,
    ...(token.kind === "color" ? { format: "color-hex" } : {}),
  };
}

function groupSchema(group: ThemeGroup, currentValue: (key: string) => string) {
  const tokens = THEME_TOKENS.filter((token) => token.group === group);
  return {
    type: "object",
    description: GROUP_DESCRIPTIONS[group],
    additionalProperties: false,
    properties: Object.fromEntries(tokens.map((token) => [token.key, tokenSchema(token, currentValue(token.key))])),
  };
}

/** `currentValue(key)` is the live value of `--osio-<key>`, shown in each token's hover. */
export function buildThemeSchema(currentValue: (key: string) => string): object {
  return {
    type: "object",
    additionalProperties: false,
    required: ["name"],
    properties: {
      name: { type: "string", minLength: 1, maxLength: THEME_LIMITS.nameMax, description: "The theme's name, unique among your themes." },
      base: { enum: [...THEME_BASES], description: "Light or dark. Leave it out to follow your mode preference." },
      palette: {
        enum: PALETTES.map((palette) => palette.id),
        markdownEnumDescriptions: PALETTES.map((palette) => `**${palette.label}**: ${palette.description}`),
        description: "The palette the theme starts from. Leave it out to follow your palette preference.",
      },
      colors: groupSchema("colors", currentValue),
      layout: groupSchema("layout", currentValue),
      fonts: groupSchema("fonts", currentValue),
    },
  };
}
