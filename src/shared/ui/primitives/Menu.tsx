/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   Menu.tsx                                           :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/24 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/24 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React from "react";

import { cx } from "../shared/classNames";

/**
 * Menu — floating menu surface (use inside a portaled/positioned wrapper).
 * Props: role/aria + native div props; elevated bg, 1px border, rounded-lg,
 *        shadow-menu, py-1. Pass children as <MenuItem> rows.
 */
export type MenuProps = React.HTMLAttributes<HTMLDivElement>;

export const Menu = React.forwardRef<HTMLDivElement, MenuProps>(
  ({ className, children, role = "menu", ...props }, ref) => (
    <div
      ref={ref}
      role={role}
      className={cx(
        "min-w-[180px] rounded-lg border border-[var(--osio-border-default)] bg-[var(--osio-bg-elevated)] py-1 shadow-[var(--osio-shadow-menu)] outline-none",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  ),
);

Menu.displayName = "Menu";

/**
 * MenuItem — a single actionable row inside a Menu.
 * Props:
 *   icon?: React.ReactNode       leading icon (lucide 14/16/18, currentColor)
 *   destructive?: boolean         renders the danger text tone
 *   className?: string
 *   ...native button props (onClick, disabled, role, ...)
 */
export interface MenuItemProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon?: React.ReactNode;
  destructive?: boolean;
}

export const MenuItem = React.forwardRef<HTMLButtonElement, MenuItemProps>(
  ({ className, icon, destructive = false, type = "button", role = "menuitem", children, ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      role={role}
      className={cx(
        "flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors duration-[120ms] hover:bg-[var(--osio-bg-hover)] focus-visible:outline-none focus-visible:bg-[var(--osio-bg-hover)] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--osio-accent)] disabled:cursor-not-allowed disabled:opacity-60",
        destructive ? "text-[var(--osio-danger)]" : "text-[var(--osio-fg-default)]",
        className,
      )}
      {...props}
    >
      {icon ? <span className="shrink-0">{icon}</span> : null}
      <span className="min-w-0 flex-1 truncate">{children}</span>
    </button>
  ),
);

MenuItem.displayName = "MenuItem";
