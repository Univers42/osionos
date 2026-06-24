/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   CanvasInspectorControls.tsx                        :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/10 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/10 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React from "react";

export const CanvasNumberControl: React.FC<{
  label: string;
  value: number;
  min: number;
  max: number;
  suffix?: string;
  onChange: (value: number) => void;
}> = ({ label, value, min, max, suffix, onChange }) => (
  <label className="osionos-layout-control-row">
    <span>{label}</span>
    <span className="osionos-layout-number-input">
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(event) => {
          const next = Number(event.currentTarget.value);
          if (Number.isFinite(next)) onChange(Math.max(min, Math.min(max, Math.round(next))));
        }}
      />
      {suffix ? <span>{suffix}</span> : null}
    </span>
  </label>
);

export const CanvasToggle: React.FC<{
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}> = ({ label, checked, onChange }) => (
  <label className="osionos-layout-control-row">
    <span>{label}</span>
    <input type="checkbox" checked={checked} onChange={(event) => onChange(event.currentTarget.checked)} />
  </label>
);

export const CanvasSegmented = <T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly T[];
  onChange: (value: T) => void;
}) => (
  <div className="osionos-layout-control-row osionos-layout-control-row--stacked">
    <span>{label}</span>
    <div className="osionos-layout-segmented">
      {options.map((option) => (
        <button key={option} type="button" data-active={option === value ? "true" : undefined} onClick={() => onChange(option)}>
          {option}
        </button>
      ))}
    </div>
  </div>
);
