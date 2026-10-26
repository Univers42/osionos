/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   VisibleWhenGate.tsx                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/25 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/25 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React from "react";
import type { Block } from "@/entities/block";
import { useVisibleWhen } from "./useVisibleWhen";

export interface VisibleWhenGateProps {
  block: Block;
  mode: "edit" | "view";
  children: React.ReactNode;
}

/**
 * Gate that shows or hides a block based on its `visibleWhen` formula. In view
 * mode a hidden block renders nothing; in edit mode the author still reaches
 * it, drawn faded with a dashed outline and a "Hidden by rule" label.
 */
export function VisibleWhenGate({ block, mode, children }: VisibleWhenGateProps): React.ReactElement | null {
  const visible = useVisibleWhen(block.visibleWhen);

  if (visible) {
    return <>{children}</>;
  }

  if (mode === "view") {
    return null;
  }

  return (
    <div data-hidden-by-rule style={{ opacity: 0.5, outline: "1px dashed var(--osio-border-default)" }}>
      {children}
      <span className="text-xs text-[var(--osio-fg-subtle)]">Hidden by rule</span>
    </div>
  );
}