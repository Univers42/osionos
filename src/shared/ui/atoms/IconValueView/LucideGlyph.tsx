/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   LucideGlyph.tsx                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/08 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/08 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { Suspense } from "react";
import { AssetRenderer } from "@univers42/ui-collection";
import dynamicIconImports from "lucide-react/dynamicIconImports";

// dynamicIconImports is a kebab-name → () => import() map of the whole lucide set, so each icon is
// its own chunk and nothing here lands in the main bundle (IconValueView lazy-imports this file).
type Loader = () => Promise<{ default: React.ComponentType<{ size?: number; color?: string }> }>;
const IMPORTS = dynamicIconImports as unknown as Record<string, Loader>;
const cache = new Map<string, React.LazyExoticComponent<React.ComponentType<{ size?: number; color?: string }>>>();

function resolveIcon(name: string) {
  if (!cache.has(name)) cache.set(name, React.lazy(IMPORTS[name]));
  return cache.get(name)!;
}

/** Render `icon:<name>` — via lucide when the name exists there, else fall back to the legacy
 *  AssetRenderer catalog (so package names like "page"/"table" keep working). */
const LucideGlyph: React.FC<{ name: string; size?: number; color?: string }> = ({ name, size = 20, color }) => {
  if (!(name in IMPORTS)) return <AssetRenderer value={`icon:${name}`} size={size} />;
  const Cmp = resolveIcon(name);
  return (
    <Suspense fallback={<span style={{ display: "inline-block", width: size, height: size }} />}>
      <Cmp size={size} color={color} />
    </Suspense>
  );
};

export default LucideGlyph;
