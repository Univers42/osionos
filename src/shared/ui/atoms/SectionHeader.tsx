/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   SectionHeader.tsx                                  :+:      :+:    :+:   */
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
 * SectionHeader — small uppercase-ish section label with an optional right slot.
 * Props:
 *   title: string                  the label text (small, muted, tracked)
 *   action?: React.ReactNode       optional right-aligned control (button/link)
 *   className?: string
 */
export interface SectionHeaderProps {
  title: string;
  action?: React.ReactNode;
  className?: string;
}

export const SectionHeader: React.FC<SectionHeaderProps> = ({ title, action, className }) => (
  <div className={cx("flex items-center justify-between gap-2", className)}>
    <span className="text-xs font-medium tracking-wide text-[var(--osio-fg-muted)]">{title}</span>
    {action ? <span className="shrink-0">{action}</span> : null}
  </div>
);
