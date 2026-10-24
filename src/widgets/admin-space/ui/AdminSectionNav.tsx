/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   AdminSectionNav.tsx                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/23 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/23 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React from "react";

import type { AdminSection } from "../model/adminSections";

interface Props {
  sections: readonly AdminSection[];
  selectedId: string;
  onSelect: (id: string) => void;
}

/** The left nav of the Admin space: one button per section the role may open. */
export const AdminSectionNav: React.FC<Props> = ({ sections, selectedId, onSelect }) => (
  <nav aria-label="Admin sections" className="flex shrink-0 gap-1 overflow-x-auto border-b border-[var(--osio-border-soft)] p-2 sm:w-48 sm:flex-col sm:overflow-visible sm:border-b-0 sm:border-r">
    {sections.map(({ id, label, Icon }) => (
      <button
        key={id}
        type="button"
        aria-current={id === selectedId ? "page" : undefined}
        onClick={() => onSelect(id)}
        className={`inline-flex shrink-0 items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm hover:bg-[var(--osio-bg-hover)] ${id === selectedId ? "bg-[var(--osio-bg-subtle)] font-medium text-[var(--osio-fg-default)]" : "text-[var(--osio-fg-muted)]"}`}
      >
        <Icon size={14} /> {label}
      </button>
    ))}
  </nav>
);
