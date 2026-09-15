/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   LoadingPane.tsx                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/07 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/07 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React from "react";

import { cx } from "../shared/classNames";

/**
 * LoadingPane — the single accent spinner filling its container while a surface
 * loads. One implementation for every pane/view (page-renderer, home, lazy
 * boundaries). Announces itself to assistive tech via role="status"; the spin
 * animation is neutralized by the global prefers-reduced-motion reset.
 */
export interface LoadingPaneProps {
  className?: string;
  label?: string;
}

export const LoadingPane: React.FC<LoadingPaneProps> = ({ className, label = "Loading" }) => (
  <div
    role="status"
    aria-label={label}
    className={cx("flex h-full flex-1 items-center justify-center", className)}
  >
    <span className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--osio-accent)] border-t-transparent" />
    <span className="sr-only">{label}</span>
  </div>
);
