/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   Input.tsx                                          :+:      :+:    :+:   */
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
 * Input — styled text input that forwards every native input prop + ref.
 * Props: all React.InputHTMLAttributes<HTMLInputElement> (value, onChange,
 *        placeholder, type, disabled, ...) plus an optional className.
 * 1px border, rounded-md, bg-surface, subtle placeholder, accent focus ring.
 */
export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cx(
        "h-[var(--osio-control-h-md)] w-full rounded-[var(--osio-radius-control)] border border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)] px-2.5 text-sm text-[var(--osio-fg-default)] transition-[color,background-color,border-color,box-shadow] duration-[var(--osio-dur-fast)] ease-[var(--osio-ease-standard)] placeholder:text-[var(--osio-fg-subtle)] hover:border-[var(--osio-border-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--osio-focus-ring-color)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--osio-bg-page)] disabled:cursor-not-allowed disabled:opacity-60",
        className,
      )}
      {...props}
    />
  ),
);

Input.displayName = "Input";
