/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   IdeInlineInput.tsx                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/19 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/19 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React from "react";

interface Props {
  initialValue?: string;
  placeholder?: string;
  depth: number;
  onSubmit: (name: string) => void;
  onCancel: () => void;
}

/** A single-line inline editor for creating or renaming a tree entry. Enter
 *  commits a non-empty trimmed value, Escape cancels, blur commits-or-cancels. */
export const IdeInlineInput: React.FC<Props> = ({ initialValue = "", placeholder, depth, onSubmit, onCancel }) => {
  const [value, setValue] = React.useState(initialValue);
  const ref = React.useRef<HTMLInputElement | null>(null);

  React.useEffect(() => {
    const input = ref.current;
    if (!input) return;
    input.focus();
    const dot = initialValue.lastIndexOf(".");
    input.setSelectionRange(0, dot > 0 ? dot : initialValue.length);
  }, [initialValue]);

  const commit = (): void => {
    const trimmed = value.trim();
    if (trimmed) onSubmit(trimmed);
    else onCancel();
  };

  return (
    <input
      ref={ref}
      value={value}
      placeholder={placeholder}
      onChange={(event) => setValue(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === "Enter") { event.preventDefault(); commit(); }
        else if (event.key === "Escape") { event.preventDefault(); onCancel(); }
      }}
      onBlur={commit}
      style={{ marginLeft: 8 + depth * 12 }}
      className="my-[2px] mr-2 w-[calc(100%-16px)] rounded border border-[var(--osio-accent)] bg-[var(--osio-code-bg)] px-1 py-[1px] text-[13px] text-[var(--osio-code-fg)] outline-none"
    />
  );
};
