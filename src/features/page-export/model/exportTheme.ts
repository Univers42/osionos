/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   exportTheme.ts                                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/19 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/19 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// DOM-side theme capture: resolves the live --osio-* tokens (whatever theme
// and palette the user runs) into a plain snapshot the pure serializers can
// consume. Kept out of the serializer modules so those stay node-testable.
// Fallbacks mirror the light-theme values in src/app/styles/global.css.

import type { ExportTheme } from "./exportTypes";

export function captureExportTheme(): ExportTheme | null {
  if (typeof document === "undefined") return null;
  const styles = getComputedStyle(document.documentElement);
  const read = (token: string, fallback: string) =>
    styles.getPropertyValue(token).trim() || fallback;
  return {
    bg: read("--osio-bg-page", "#faf9f5"),
    fg: read("--osio-fg-default", "#1a1a18"),
    fgMuted: read("--osio-fg-muted", "#57534e"),
    accent: read("--osio-accent", "#cc785c"),
    border: read("--osio-border-default", "#ebe8e0"),
    codeBg: read("--osio-code-bg", "#f5f5f4"),
    codeFg: read("--osio-code-fg", "#1f1f1f"),
    fontSans: read("--osio-font-family-sans", "ui-sans-serif, sans-serif"),
    fontMono: read("--osio-font-family-mono", "ui-monospace, monospace"),
  };
}
