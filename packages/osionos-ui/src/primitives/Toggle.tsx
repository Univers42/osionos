/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   Toggle.tsx                                         :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/05/18 21:19:22 by dlesieur          #+#    #+#             */
/*   Updated: 2026/05/18 21:19:22 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useCallback } from "react";

interface ToggleProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  size?: "sm" | "md";
  label?: string;
  describedBy?: string;
}

const SIZES = {
  sm: { trackWidth: 26, trackHeight: 14, knob: 10, offset: 12 },
  md: { trackWidth: 34, trackHeight: 18, knob: 14, offset: 16 },
} as const;

export const Toggle: React.FC<ToggleProps> = ({
  checked,
  onChange,
  disabled = false,
  size = "md",
  label,
  describedBy,
}) => {
  const metrics = SIZES[size];

  const toggle = useCallback(() => {
    if (!disabled) onChange(!checked);
  }, [checked, disabled, onChange]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>) => {
      if (event.key !== " " && event.key !== "Enter") return;
      event.preventDefault();
      toggle();
    },
    [toggle],
  );

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-disabled={disabled || undefined}
      aria-label={label ?? "Toggle setting"}
      aria-describedby={describedBy}
      disabled={disabled}
      className="relative inline-flex shrink-0 items-center rounded-full p-0.5 transition-colors duration-[var(--osio-dur-base)] ease-[var(--osio-ease-standard)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--osio-focus-ring-color)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--osio-bg-page)] disabled:cursor-not-allowed disabled:opacity-55"
      style={{
        width: metrics.trackWidth,
        height: metrics.trackHeight,
        backgroundColor: checked ? "var(--osio-accent)" : "var(--osio-bg-muted)",
      }}
      onClick={toggle}
      onKeyDown={handleKeyDown}
    >
      <span
        className="block rounded-full bg-[var(--osio-accent-fg)] shadow-[var(--osio-e1)] transition-transform duration-[var(--osio-dur-base)] ease-[var(--osio-ease-spring)]"
        style={{
          width: metrics.knob,
          height: metrics.knob,
          transform: checked ? `translateX(${metrics.offset}px)` : "translateX(0)",
        }}
      />
    </button>
  );
};
