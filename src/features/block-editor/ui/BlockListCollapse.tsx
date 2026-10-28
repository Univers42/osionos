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

const BUTTON =
  "items-center justify-center rounded-xs text-[var(--osio-fg-subtle)] hover:bg-[var(--osio-bg-hover)] hover:text-[var(--osio-fg-muted)]";

/**
 * Notion-style collapse triangle for a list item that has nested children.
 * Given the item's marker, it takes the marker's place: the marker shows until
 * the row is hovered, the triangle from then on and for as long as the item is
 * folded, so the row needs no gutter and the marker sits on the text edge like
 * any other block. A to-do's checkbox cannot double as the toggle, so without a
 * marker the triangle ends the row. Toggling flips `collapsed`,
 * which `shouldRenderChildren` honours to hide/show the subtree.
 */
export const BlockListCollapse: React.FC<{
  collapsed?: boolean;
  onToggle: () => void;
  marker?: React.ReactNode;
}> = ({ collapsed, onToggle, marker }) => {
  const chevron = (
    <ChevronRight
      size={12}
      className={`transition-transform duration-(--osio-dur-fast) ${collapsed ? "" : "rotate-90"}`}
    />
  );
  const props = {
    type: "button" as const,
    "aria-label": collapsed ? "Expand list item" : "Collapse list item",
    "aria-expanded": !collapsed,
    "data-list-collapse": "",
    onMouseDown: (e: React.MouseEvent) => e.preventDefault(),
    onClick: onToggle,
  };
  if (!marker) {
    return (
      <button
        {...props}
        className={`${BUTTON} flex h-6 w-4 shrink-0 transition-opacity duration-(--osio-dur-fast) ${
          collapsed ? "opacity-100" : "opacity-0 group-hover:opacity-100"
        }`}
      >
        {chevron}
      </button>
    );
  }
  return (
    <button {...props} className={`${BUTTON} relative flex shrink-0 self-start`}>
      <span className={`flex ${collapsed ? "invisible" : "group-hover:invisible"}`}>{marker}</span>
      <span className={`absolute inset-x-0 top-0 h-6 items-center justify-center ${collapsed ? "flex" : "hidden group-hover:flex"}`}>
        {chevron}
      </span>
    </button>
  );
};
