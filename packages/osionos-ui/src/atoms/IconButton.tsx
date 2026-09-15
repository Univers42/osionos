/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   IconButton.tsx                                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/05/18 21:19:21 by dlesieur          #+#    #+#             */
/*   Updated: 2026/05/18 21:19:21 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React from "react";

import { cx } from "../shared/classNames";

export type IconButtonSize = "xs" | "sm" | "md";
export type IconButtonTone = "default" | "muted" | "danger";

export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  size?: IconButtonSize;
  tone?: IconButtonTone;
}

const SIZE_CLASS: Record<IconButtonSize, string> = {
  // 24px minimum box — WCAG 2.2 target-size (Lighthouse a11y gate). Keep the
  // ICON small via padding; do not shrink the hit area below h-6/w-6.
  xs: "h-6 w-6 min-h-[24px] min-w-[24px] p-1",
  sm: "h-6 w-6 min-h-[24px] min-w-[24px] p-1",
  md: "h-8 w-8 p-1.5",
};

const TONE_CLASS: Record<IconButtonTone, string> = {
  default: "text-[var(--osio-fg-default)] hover:bg-[var(--osio-bg-hover)]",
  muted: "text-[var(--osio-fg-muted)] hover:bg-[var(--osio-bg-hover)] hover:text-[var(--osio-fg-default)]",
  danger: "text-[var(--osio-danger)] hover:bg-[var(--osio-bg-hover)] hover:text-[var(--osio-danger-hover)]",
};

export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ className, size = "sm", tone = "muted", type = "button", children, ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      className={cx(
        "inline-flex shrink-0 items-center justify-center rounded-[var(--osio-radius-chip)] transition-[background-color,color,box-shadow,transform] duration-[var(--osio-dur-fast)] ease-[var(--osio-ease-standard)] active:scale-[0.92] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--osio-focus-ring-color)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--osio-bg-page)] disabled:cursor-not-allowed disabled:opacity-60 disabled:active:scale-100",
        SIZE_CLASS[size],
        TONE_CLASS[tone],
        className,
      )}
      {...props}
    >
      {children}
    </button>
  ),
);

IconButton.displayName = "IconButton";
