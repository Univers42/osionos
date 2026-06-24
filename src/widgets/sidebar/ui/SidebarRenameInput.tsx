/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   SidebarRenameInput.tsx                             :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/07 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/07 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useEffect, useRef, useState } from "react";

interface Props {
  initialValue: string;
  onCommit: (value: string) => void;
  onCancel: () => void;
}

/**
 * Inline rename field for a sidebar tree row (files AND folders). Mounts focused with the
 * text selected; Enter / blur commits the trimmed value, Escape cancels. Clicks are stopped
 * so editing never triggers the row's open/expand handler.
 */
export const SidebarRenameInput: React.FC<Props> = ({ initialValue, onCommit, onCancel }) => {
  const [value, setValue] = useState(initialValue);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      onCommit(value.trim());
    } else if (event.key === "Escape") {
      event.preventDefault();
      onCancel();
    }
  }

  return (
    <input
      ref={inputRef}
      value={value}
      aria-label="Rename"
      autoComplete="off"
      onChange={(event) => setValue(event.currentTarget.value)}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={handleKeyDown}
      onBlur={() => onCommit(value.trim())}
      className="flex min-w-0 flex-1 h-6 rounded-md border border-[var(--osio-accent)] bg-[var(--osio-bg-surface)] px-1.5 text-sm text-[var(--osio-fg-default)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--osio-accent)]"
    />
  );
};
