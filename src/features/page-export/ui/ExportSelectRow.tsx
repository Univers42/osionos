/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ExportSelectRow.tsx                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/12 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/12 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React from "react";
import { ChevronDown } from "lucide-react";

interface ExportSelectRowProps<T extends string> {
  label: string;
  value: T;
  options: ReadonlyArray<{ value: T; label: string }>;
  onChange: (next: T) => void;
}

/**
 * One "label ……… value ▾" row of the Export panel. A native <select> (styled
 * as a Notion-style ghost button) — the platform control is fully accessible,
 * keyboard-driven for free, and has no portal/focus-trap conflict inside a
 * modal the way a custom popup dropdown does.
 */
export function ExportSelectRow<T extends string>({
  label,
  value,
  options,
  onChange,
}: ExportSelectRowProps<T>) {
  return (
    <div className="flex h-8 items-center justify-between gap-2">
      <span className="text-sm text-[var(--osio-fg-muted)]">{label}</span>
      <div className="relative flex items-center">
        <select
          aria-label={label}
          value={value}
          onChange={(event) => onChange(event.target.value as T)}
          className="cursor-pointer appearance-none rounded-md bg-transparent py-1 pl-2 pr-6 text-right text-sm font-medium text-[var(--osio-fg-default)] hover:bg-[var(--osio-bg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--osio-focus-ring-color)]"
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDown size={14} className="pointer-events-none absolute right-1 text-[var(--osio-fg-subtle)]" />
      </div>
    </div>
  );
}
