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

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  tone?: ButtonTone;
}

const TONE_CLASS: Record<ButtonTone, string> = {
  default: "border border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)] text-[var(--osio-fg-default)] hover:bg-[var(--osio-bg-hover)]",
  primary: "bg-[var(--osio-accent)] text-[var(--osio-accent-fg)] hover:opacity-90",
  danger: "bg-[var(--osio-danger)]/10 text-[var(--osio-danger)] hover:bg-[var(--osio-danger)]/15",
  ghost: "text-[var(--osio-fg-muted)] hover:bg-[var(--osio-bg-hover)] hover:text-[var(--osio-fg-default)]",
};

export const Button: React.FC<ButtonProps> = ({
  className,
  tone = "default",
  type = "button",
  children,
  ...props
}) => (
  <button
    type={type}
    className={cx(
      "inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-60",
      TONE_CLASS[tone],
      className,
    )}
    {...props}
  >
    {children}
  </button>
);
