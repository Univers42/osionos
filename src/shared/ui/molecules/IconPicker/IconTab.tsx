/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   IconTab.tsx                                        :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/08 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/08 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React from "react";
import dynamicIconImports from "lucide-react/dynamicIconImports";
import LucideGlyph from "@/shared/ui/atoms/IconValueView/LucideGlyph";

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

/** Searchable lucide grid; default view shows a curated common set, search spans all icons. */
export const IconTab: React.FC<{ query: string; color?: string; onPick: (name: string) => void }> = ({ query, color, onPick }) => {
  const q = query.trim().toLowerCase();
  const names = q ? ALL_NAMES.filter((name) => name.includes(q)).slice(0, 150) : COMMON;

  if (names.length === 0) {
    return <p className="p-6 text-center text-sm text-[var(--osio-fg-muted)]">No icon matches “{query}”.</p>;
  }
  return (
    <div className="grid grid-cols-8 gap-1 p-2">
      {names.map((name) => (
        <button
          key={name}
          type="button"
          title={name}
          onClick={() => onPick(name)}
          className="flex h-8 w-8 items-center justify-center rounded-md text-[var(--osio-fg-default)] transition-colors duration-[120ms] hover:bg-[var(--osio-bg-hover)]"
        >
          <LucideGlyph name={name} size={20} color={color} />
        </button>
      ))}
    </div>
  );
};

export default IconTab;
