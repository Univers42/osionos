/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   RecordLimitButton.tsx                              :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/07 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/07 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Hover affordance on an inline database block: sets how many records the embed
 * displays (the block's `recordLimit`). Fewer records → the embed is shorter, so
 * it integrates into the page instead of overflowing. "All" clears the cap.
 */

import React from "react";
import { Menu, MenuItem } from "@/shared/ui/primitives/Menu";

interface RecordLimitButtonProps {
  value?: number;
  onChange: (recordLimit: number | undefined) => void;
}

const PRESETS: Array<{ label: string; value: number | undefined }> = [
  { label: "5 records", value: 5 },
  { label: "10 records", value: 10 },
  { label: "25 records", value: 25 },
  { label: "50 records", value: 50 },
  { label: "100 records", value: 100 },
  { label: "All records", value: undefined },
];

export const RecordLimitButton: React.FC<RecordLimitButtonProps> = ({ value, onChange }) => {
  const [open, setOpen] = React.useState(false);
  const label = value ? `${value} rows` : "All rows";
  return (
    <div className="absolute right-[84px] top-2 z-[var(--osio-z-raised)] opacity-0 transition-opacity group-hover/dbblock:opacity-100 focus-within:opacity-100">
      {open ? (
        <Menu className="absolute right-0 top-0 w-40" onMouseLeave={() => setOpen(false)}>
          {PRESETS.map((preset) => (
            <MenuItem
              key={preset.label}
              onClick={() => { setOpen(false); onChange(preset.value); }}
              aria-current={preset.value === value}
            >
              {preset.label}
            </MenuItem>
          ))}
        </Menu>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded border border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)] px-2 py-0.5 text-xs text-[var(--osio-fg-subtle)] transition-colors hover:bg-[var(--osio-bg-hover)] hover:text-[var(--osio-fg-default)]"
          aria-label="Records to display"
        >
          ▤ {label}
        </button>
      )}
    </div>
  );
};
