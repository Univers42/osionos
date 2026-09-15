/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   Badge.tsx                                          :+:      :+:    :+:   */
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
 * Badge — small rounded-full pill on a subtle tinted background.
 * Props:
 *   tone?: "default" | "accent" | "success" | "danger" | "warning"  (default "default")
 *   children: React.ReactNode   label content
 *   className?: string
 * Each tone pairs a subtle tint bg with its matching token fg.
 */
export type BadgeTone = "default" | "accent" | "success" | "danger" | "warning";

export interface BadgeProps {
  tone?: BadgeTone;
  children: React.ReactNode;
  className?: string;
}

const TONE_CLASS: Record<BadgeTone, string> = {
  default: "bg-[var(--osio-block-tint-gray-bg)] text-[var(--osio-block-tint-gray-fg)]",
  accent: "bg-[var(--osio-accent-subtle)] text-[var(--osio-accent-text)]",
  success: "bg-[var(--osio-block-tint-green-bg)] text-[var(--osio-block-tint-green-fg)]",
  danger: "bg-[var(--osio-block-tint-red-bg)] text-[var(--osio-block-tint-red-fg)]",
  warning: "bg-[var(--osio-block-tint-yellow-bg)] text-[var(--osio-block-tint-yellow-fg)]",
};

export const Badge: React.FC<BadgeProps> = ({ tone = "default", children, className }) => (
  <span
    className={cx(
      "inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium",
      TONE_CLASS[tone],
      className,
    )}
  >
    {children}
  </span>
);
