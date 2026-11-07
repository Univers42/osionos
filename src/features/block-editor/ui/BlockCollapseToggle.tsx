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
      className="mt-0.5 -ml-0.5 flex h-6 w-6 min-h-[24px] min-w-[24px] shrink-0 items-center justify-center rounded-xs text-[var(--osio-fg-muted)] hover:bg-[var(--osio-bg-hover)] hover:text-[var(--osio-fg-default)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--osio-focus-ring-color)]"
    >
      <ChevronRight size={14} className={`transition-transform duration-(--osio-dur-fast) ${collapsed ? "" : "rotate-90"}`} />
    </button>
  );
}
