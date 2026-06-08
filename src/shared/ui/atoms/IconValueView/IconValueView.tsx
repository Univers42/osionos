/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   IconValueView.tsx                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/08 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/08 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { Suspense } from "react";
import { AssetRenderer } from "@univers42/ui-collection";
import { parseIconValue } from "@/shared/lib/iconValue/iconValue";

// Lucide rendering is code-split: surfaces that only use emoji never load the lucide map.
const LucideGlyph = React.lazy(() => import("./LucideGlyph"));

interface Props {
  value?: string | null;
  size?: number;
  className?: string;
}

/**
 * Drop-in superset of AssetRenderer. Handles the picker's new forms — custom SVG/image (`img:`),
 * lucide icons (with optional color), emoji with a color chip — and delegates every legacy value
 * (plain emoji, `icon:<catalog>`, `url:…`) to AssetRenderer, so existing icons render unchanged.
 */
export const IconValueView: React.FC<Props> = ({ value, size = 20, className }) => {
  const raw = (value ?? "").trim();
  const parsed = parseIconValue(raw);
  if (!parsed) return null;

  if (parsed.kind === "image" && raw.startsWith("img:")) {
    return (
      <img className={className} src={parsed.ref} alt="" width={size} height={size} draggable={false} style={{ objectFit: "contain" }} />
    );
  }

  if (parsed.kind === "icon") {
    const placeholder = <span style={{ display: "inline-block", width: size, height: size }} />;
    return (
      <span className={className} style={{ display: "inline-flex", color: parsed.color }}>
        <Suspense fallback={placeholder}>
          <LucideGlyph name={parsed.ref} size={size} color={parsed.color} />
        </Suspense>
      </span>
    );
  }

  if (parsed.kind === "emoji" && parsed.bg) {
    return (
      <span
        className={className}
        role="img"
        style={{
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          fontSize: size, lineHeight: 1, background: parsed.bg,
          borderRadius: Math.round(size * 0.32), padding: Math.round(size * 0.22),
        }}
      >
        {parsed.ref}
      </span>
    );
  }

  return <AssetRenderer value={raw} size={size} className={className} />;
};
