/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   Button.tsx                                         :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/05/18 21:19:21 by dlesieur          #+#    #+#             */
/*   Updated: 2026/05/18 21:19:21 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React from "react";

import { cx } from "../shared/classNames";

export type ButtonTone = "default" | "primary" | "danger" | "ghost";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  tone?: ButtonTone;
  size?: ButtonSize;
}

// Canonical control heights (density system) — one height per size, everywhere.
const SIZE_CLASS: Record<ButtonSize, string> = {
  sm: "h-[var(--osio-control-h-sm)] gap-1 px-2.5 text-[13px]",
  md: "h-[var(--osio-control-h-md)] gap-1.5 px-3 text-sm",
  lg: "h-[var(--osio-control-h-lg)] gap-2 px-4 text-sm",
};

const TONE_CLASS: Record<ButtonTone, string> = {
  default:
    "border border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)] text-[var(--osio-fg-default)] hover:bg-[var(--osio-bg-hover)] hover:border-[var(--osio-border-strong)]",
  primary:
    "bg-[var(--osio-accent)] text-[var(--osio-accent-fg)] shadow-[var(--osio-e1)] hover:bg-[var(--osio-accent-hover)] hover:shadow-[var(--osio-e2)]",
  danger:
    "bg-[var(--osio-danger)] text-[var(--osio-accent-fg)] shadow-[var(--osio-e1)] hover:bg-[var(--osio-danger-hover)] hover:shadow-[var(--osio-e2)]",
  ghost: "text-[var(--osio-fg-muted)] hover:bg-[var(--osio-bg-hover)] hover:text-[var(--osio-fg-default)]",
};

// Shared base: semantic control radius, token-driven motion, tactile press
// (scale via spring), one focus-ring spec. Press is disabled when disabled.
const BASE =
  "inline-flex select-none items-center justify-center rounded-[var(--osio-radius-control)] font-medium " +
  "transition-[background-color,border-color,color,box-shadow,transform] duration-[var(--osio-dur-fast)] ease-[var(--osio-ease-standard)] " +
  "active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--osio-focus-ring-color)] " +
  "focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--osio-bg-page)] " +
  "disabled:cursor-not-allowed disabled:opacity-60 disabled:active:scale-100 disabled:shadow-none";

export const Button: React.FC<ButtonProps> = ({
  className,
  tone = "default",
  size = "md",
  type = "button",
  children,
  ...props
}) => (
  <button type={type} className={cx(BASE, SIZE_CLASS[size], TONE_CLASS[tone], className)} {...props}>
    {children}
  </button>
);
