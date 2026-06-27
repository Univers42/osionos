/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   BlockCollapseToggle.tsx                            :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/02 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/02 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React from "react";
import { ChevronRight } from "lucide-react";

/** Shared collapse/expand chevron used by every collapsible container block
 *  (toggle, and now quote/callout) so the affordance stays consistent. */
export function BlockCollapseToggle({ collapsed, onToggle }: Readonly<{ collapsed?: boolean; onToggle: () => void }>) {
  return (
    <button
      type="button"
      aria-label={collapsed ? "Expand" : "Collapse"}
      aria-expanded={!collapsed}
      onClick={onToggle}
      className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded text-[var(--osio-fg-muted)] hover:bg-[var(--osio-bg-hover)] hover:text-[var(--osio-fg-default)]"
    >
      <ChevronRight size={14} className={`transition-transform duration-150 ${collapsed ? "" : "rotate-90"}`} />
    </button>
  );
}
