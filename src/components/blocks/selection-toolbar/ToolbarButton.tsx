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

const TOOLBAR_CELL =
  "grid h-9 w-9 place-items-center rounded-md border border-transparent text-[var(--osio-fg-muted)] transition-colors hover:bg-[var(--osio-menu-item-hover-bg)] hover:text-[var(--osio-fg-default)] data-[kb-active=true]:bg-[var(--osio-menu-item-hover-bg)] data-[kb-active=true]:text-[var(--osio-fg-default)] disabled:pointer-events-none disabled:opacity-40";

const TOOLBAR_CELL_ACTIVE =
  "border-[var(--osio-border-default)] bg-[var(--osio-bg-subtle)] text-[var(--osio-fg-default)]";

/** One square icon cell of the format grid — identical hit area and pressed state. */
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
    data-selection-panel-control
    disabled={disabled}
    className={[TOOLBAR_CELL, active ? TOOLBAR_CELL_ACTIVE : ""].join(" ")}
    onMouseDown={(event) => event.preventDefault()}
    onClick={onClick}
  >
    {children}
  </button>
);

/** A full-width row in the panel: Turn into, Comment, a skill, Edit with AI. */
export const ToolbarRowButton: React.FC<{
  title: string;
  onClick: () => void;
  disabled?: boolean;
  role?: React.AriaRole;
  children: React.ReactNode;
}> = ({ title, onClick, disabled, role, children }) => (
  <button
    type="button"
    title={title}
    role={role}
    data-selection-panel-control
    disabled={disabled}
    className="flex h-9 w-full items-center gap-2 rounded-md px-2 text-left text-sm font-medium text-[var(--osio-fg-default)] transition-colors hover:bg-[var(--osio-menu-item-hover-bg)] data-[kb-active=true]:bg-[var(--osio-menu-item-hover-bg)] disabled:pointer-events-none disabled:opacity-40"
    onMouseDown={(event) => event.preventDefault()}
    onClick={onClick}
  >
    {children}
  </button>
);

/** The horizontal rule between the panel's groups. */
export const ToolbarSeparator: React.FC = () => (
  <div
    aria-hidden
    className="my-1 h-px w-full shrink-0 bg-[var(--osio-menu-separator)]"
  />
);
