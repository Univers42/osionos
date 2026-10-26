/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   BlockVisibilityPopover.tsx                          :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/25 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/25 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useCallback, useRef } from "react";
import type { Block } from "@/entities/block";
import { useClickOutside, useEscapeKey } from "@/shared/ui";
import { MENU_PANEL_CLASS } from "@/features/page-management/ui/menuChrome";
import { VisibilityFormulaField } from "./VisibilityFormulaField";

export interface BlockVisibilityPopoverProps {
  block: Block;
  onSave: (updates: Partial<Block>) => void;
  onClose: () => void;
}

export const BlockVisibilityPopover: React.FC<BlockVisibilityPopoverProps> = ({
  block,
  onSave,
  onClose,
}) => {
  const panelRef = useRef<HTMLDivElement | null>(null);
  useClickOutside(panelRef, onClose);
  useEscapeKey(onClose);

  const commit = useCallback(
    (next: string) => {
      onSave({ visibleWhen: next === "" ? undefined : next });
      onClose();
    },
    [onSave, onClose],
  );

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label="Show when"
      className={`${MENU_PANEL_CLASS} absolute left-0 top-full mt-1 w-[min(24rem,90vw)] p-3`}
    >
      <p className="mb-2 text-xs font-medium text-[var(--osio-fg-muted)]">Show when…</p>
      <VisibilityFormulaField value={block.visibleWhen} onCommit={commit} />
    </div>
  );
};