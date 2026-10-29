/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ToolbarButton.tsx                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/29 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/29 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React from "react";

export const TOOLBAR_ICON = "h-[18px] w-[18px]";

const TOOLBAR_BUTTON_BASE =
  "grid h-8 min-w-8 place-items-center rounded-md border border-transparent px-2 text-xs font-semibold text-[var(--osio-fg-muted)] transition-colors hover:bg-[var(--osio-bg-subtle)] hover:text-[var(--osio-fg-default)] disabled:pointer-events-none disabled:opacity-40";

const TOOLBAR_ACTIVE_BUTTON =
  "border-[var(--osio-border-default)] bg-[var(--osio-bg-subtle)] text-[var(--osio-fg-default)]";

/** One icon button shape for the whole toolbar — identical hit area, one pressed state. */
export const ToolbarIconButton: React.FC<{
  label: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
}> = ({ label, onClick, active, disabled, children }) => (
  <button
    type="button"
    title={label}
    aria-label={label}
    aria-pressed={active}
    disabled={disabled}
    className={[TOOLBAR_BUTTON_BASE, active ? TOOLBAR_ACTIVE_BUTTON : ""].join(" ")}
    onMouseDown={(event) => event.preventDefault()}
    onClick={onClick}
  >
    {children}
  </button>
);

/** A 1px vertical rule between toolbar groups. */
export const ToolbarDivider: React.FC = () => (
  <span
    aria-hidden
    className="mx-0.5 h-4 w-px shrink-0 bg-[var(--osio-menu-separator)]"
  />
);
