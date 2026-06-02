/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   BlockListCollapse.tsx                              :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/02 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/02 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React from "react";
import { ChevronRight } from "lucide-react";

/**
 * Notion-style collapse triangle for a list item that has nested children.
 * It lives in the left gutter (absolute) so it never shifts the bullet:
 * hidden until the row is hovered, but pinned visible while collapsed so a
 * folded list reads as folded. Toggling flips `collapsed`, which
 * `shouldRenderChildren` honours to hide/show the subtree.
 */
export const BlockListCollapse: React.FC<{
  collapsed?: boolean;
  onToggle: () => void;
}> = ({ collapsed, onToggle }) => (
  <button
    type="button"
    aria-label={collapsed ? "Expand list item" : "Collapse list item"}
    aria-expanded={!collapsed}
    data-list-collapse=""
    onMouseDown={(e) => e.preventDefault()}
    onClick={onToggle}
    className={`absolute left-0 top-0 flex h-6 w-4 items-center justify-center rounded text-[var(--osio-fg-subtle)] transition-opacity duration-100 hover:bg-[var(--osio-bg-hover)] hover:text-[var(--osio-fg-muted)] ${
      collapsed ? "opacity-100" : "opacity-0 group-hover:opacity-100"
    }`}
  >
    <ChevronRight
      size={12}
      className={`transition-transform duration-150 ${collapsed ? "" : "rotate-90"}`}
    />
  </button>
);
