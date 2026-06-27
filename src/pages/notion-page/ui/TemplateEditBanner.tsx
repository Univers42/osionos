/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   TemplateEditBanner.tsx                             :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React from "react";
import { Database } from "lucide-react";

import { usePageStore } from "@/store/usePageStore";
import { useUserStore } from "@/features/auth";
import type { PageEntry, PageRecurrenceEvery } from "@/entities/page";

const RECURRENCE_OPTIONS: { value: PageRecurrenceEvery; label: string }[] = [
  { value: "none", label: "Don't duplicate" },
  { value: "day", label: "Duplicate every day" },
  { value: "week", label: "Duplicate every week" },
  { value: "month", label: "Duplicate every month" },
];

/** Amber "You're editing a template" banner with the "Duplicate every…" recurrence control. */
export const TemplateEditBanner: React.FC<{ page: PageEntry }> = ({ page }) => {
  const patchTemplateRecurrence = usePageStore((s) => s.patchTemplateRecurrence);
  const dbName = useUserStore((s) => s.activeWorkspace()?.name) ?? "this database";
  const every = page.recurrence?.every ?? "none";

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-[var(--osio-warning)] bg-[var(--osio-block-tint-yellow-bg)] px-4 py-2 text-sm text-[var(--osio-block-tint-yellow-fg)]">
      <Database size={14} aria-hidden />
      <span>You&apos;re editing a template in <strong>{dbName}</strong></span>
      <select
        aria-label="Template recurrence"
        value={every}
        onChange={(e) => patchTemplateRecurrence(page._id, { every: e.target.value as PageRecurrenceEvery })}
        className="ml-auto rounded-md border border-[var(--osio-warning)] bg-[var(--osio-bg-surface)] px-2 py-1 text-xs text-[var(--osio-fg-default)]"
      >
        {RECURRENCE_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
};
