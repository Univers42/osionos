/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   styleGuideData.ts                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/24 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/24 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Static swatch tables for the DEV-only style-guide route. Every entry is a CSS
 * custom-property name — the route renders each as a chip filled with that token,
 * so the source of truth stays the token layer (never a hardcoded hex here).
 */

export interface Swatch {
  token: string;
  /** "fg" tokens are painted as text colour; the rest fill the chip. */
  kind?: "fill" | "fg";
}

export const SURFACE_SWATCHES: Swatch[] = [
  { token: "--osio-bg-page" },
  { token: "--osio-bg-surface" },
  { token: "--osio-bg-subtle" },
  { token: "--osio-bg-muted" },
  { token: "--osio-bg-hover" },
];

export const TEXT_SWATCHES: Swatch[] = [
  { token: "--osio-fg-default", kind: "fg" },
  { token: "--osio-fg-muted", kind: "fg" },
  { token: "--osio-fg-subtle", kind: "fg" },
  { token: "--osio-fg-strong", kind: "fg" },
];

export const ACCENT_SWATCHES: Swatch[] = [
  { token: "--osio-accent" },
  { token: "--osio-accent-text", kind: "fg" },
  { token: "--osio-accent-subtle" },
];

export const STATUS_SWATCHES: Swatch[] = [
  { token: "--osio-border-default" },
  { token: "--osio-danger" },
  { token: "--osio-success" },
  { token: "--osio-warning" },
];

export const BLOCK_TINTS = [
  "gray",
  "brown",
  "orange",
  "yellow",
  "green",
  "blue",
  "purple",
  "pink",
  "red",
] as const;
