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

export const RADIUS_TOKENS = [
  "--osio-radius-xs",
  "--osio-radius-sm",
  "--osio-radius",
  "--osio-radius-lg",
  "--osio-radius-chip",
  "--osio-radius-control",
  "--osio-radius-card",
  "--osio-radius-panel",
  "--osio-radius-overlay",
  "--osio-radius-full",
] as const;

export const ELEVATION_TOKENS = [
  "--osio-e0",
  "--osio-e1",
  "--osio-e2",
  "--osio-e3",
  "--osio-e4",
  "--osio-e5",
] as const;

export const DURATION_TOKENS = [
  "--osio-dur-instant",
  "--osio-dur-fast",
  "--osio-dur-base",
  "--osio-dur-slow",
] as const;

export const EASING_TOKENS = [
  "--osio-ease-standard",
  "--osio-ease-out",
  "--osio-ease-emphasized",
  "--osio-ease-decelerate",
  "--osio-ease-accelerate",
  "--osio-ease-spring",
] as const;

export const CONTROL_HEIGHT_TOKENS = [
  "--osio-control-h-xs",
  "--osio-control-h-sm",
  "--osio-control-h-md",
  "--osio-control-h-lg",
] as const;

export const SPACE_TOKENS = [
  "--osio-space-1",
  "--osio-space-2",
  "--osio-space-3",
  "--osio-space-4",
  "--osio-space-5",
  "--osio-space-6",
  "--osio-space-7",
  "--osio-space-8",
  "--osio-space-9",
  "--osio-space-10",
  "--osio-space-11",
  "--osio-space-12",
] as const;
