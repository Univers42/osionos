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
  xs: "h-5 w-5 p-0.5",
  sm: "h-6 w-6 p-1",
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
        "inline-flex shrink-0 items-center justify-center rounded-md transition-colors duration-[120ms] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--osio-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--osio-bg-page)] disabled:cursor-not-allowed disabled:opacity-60",
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
