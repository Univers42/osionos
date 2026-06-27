/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   RailIcon.tsx                                       :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React from "react";
import type { LucideIcon } from "lucide-react";
import { cx } from "@/shared/ui/shared/classNames";
import { IconValueView } from "@/shared/ui/atoms/IconValueView";

interface Props {
  label: string;
  Icon?: LucideIcon;
  /** An iconValue string (emoji/lucide/img) for app launchers — takes precedence over Icon. */
  iconValue?: string;
  active?: boolean;
  /** Unread count → a small accent pill on the icon (e.g. pending invitations). */
  badge?: number;
  onClick: () => void;
}

/** One activity-rail button: an icon with a left accent bar when active.
 *  Icon-only, so it carries both aria-label and title (no Tooltip primitive). */
export const RailIcon: React.FC<Props> = ({ label, Icon, iconValue, active = false, badge = 0, onClick }) => (
  <button
    type="button"
    role="tab"
    aria-selected={active}
    aria-label={badge > 0 ? `${label} (${badge} new)` : label}
    title={label}
    data-active={active || undefined}
    onClick={onClick}
    className={cx(
      "relative grid h-10 w-10 place-items-center rounded-md transition-colors duration-[120ms]",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--osio-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--osio-bg-subtle)]",
      active
        ? "text-[var(--osio-fg-default)]"
        : "text-[var(--osio-fg-muted)] hover:bg-[var(--osio-bg-hover)] hover:text-[var(--osio-fg-default)]",
    )}
  >
    {active ? (
      <span
        aria-hidden="true"
        className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-r bg-[var(--osio-accent)]"
      />
    ) : null}
    {iconValue ? <IconValueView value={iconValue} size={20} /> : Icon ? <Icon size={20} strokeWidth={1.75} /> : null}
    {badge > 0 ? (
      <span
        aria-hidden="true"
        className="absolute right-1 top-1 grid h-4 min-w-[16px] place-items-center rounded-full bg-[var(--osio-accent)] px-1 text-[10px] font-semibold leading-none text-[var(--osio-accent-fg)]"
      >
        {badge > 99 ? "99+" : badge}
      </span>
    ) : null}
  </button>
);
