/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   IconTab.tsx                                        :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/08 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/12 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useMemo, useRef } from "react";
import dynamicIconImports from "lucide-react/dynamicIconImports";
import LucideGlyph from "@/shared/ui/atoms/IconValueView/LucideGlyph";
import { VirtualGrid, type GridSection } from "./VirtualRows";

const ALL_NAMES = Object.keys(dynamicIconImports as Record<string, unknown>);
const COMMON = [
  "star", "heart", "flame", "zap", "bell", "bookmark", "flag", "pin", "tag", "rocket",
  "lightbulb", "target", "trophy", "gift", "sparkles", "check", "check-circle", "x", "plus", "minus",
  "calendar", "clock", "folder", "file", "file-text", "image", "link", "search", "settings", "filter",
  "user", "users", "home", "mail", "message-circle", "phone", "map-pin", "globe", "lock", "key",
  "shield", "eye", "sun", "moon", "cloud", "coffee", "music", "camera", "video", "mic",
  "pencil", "trash-2", "download", "upload", "share-2", "thumbs-up", "smile", "info", "help-circle", "alert-triangle",
  "trending-up", "bar-chart-3", "pie-chart", "database", "code", "terminal", "git-branch", "package", "truck", "shopping-cart",
  "credit-card", "dollar-sign", "activity", "book", "graduation-cap", "briefcase", "lightbulb", "wand-2", "palette", "brush",
].filter((name, i, arr) => arr.indexOf(name) === i && name in (dynamicIconImports as Record<string, unknown>));

/** The full lucide set (~1.9k), virtualized: a Popular section on top, then every
 *  icon A→Z. Only visible rows mount, so only visible per-icon chunks load. */
export const IconTab: React.FC<{ query: string; color?: string; onPick: (name: string) => void }> = ({ query, color, onPick }) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  const sections = useMemo<Array<GridSection<string>>>(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      return [
        { title: "Popular", items: COMMON },
        { title: `All icons · ${ALL_NAMES.length}`, items: ALL_NAMES },
      ];
    }
    const kebab = q.replace(/\s+/g, "-");
    return [{ items: ALL_NAMES.filter((name) => name.includes(kebab) || name.includes(q)) }];
  }, [query]);

  if (sections.every((section) => section.items.length === 0)) {
    return <p className="p-6 text-center text-sm text-[var(--osio-fg-muted)]">No icon matches “{query}”.</p>;
  }
  return (
    <div ref={scrollRef} className="h-full overflow-auto py-1">
      <VirtualGrid
        scrollRef={scrollRef}
        sections={sections}
        perRow={8}
        renderItem={(name) => (
          <button
            key={name}
            type="button"
            title={name}
            onClick={() => onPick(name)}
            className="flex h-8 w-8 items-center justify-center rounded-md text-[var(--osio-fg-default)] transition-colors duration-[120ms] hover:bg-[var(--osio-bg-hover)]"
          >
            <LucideGlyph name={name} size={20} color={color} />
          </button>
        )}
      />
    </div>
  );
};

export default IconTab;
