/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   WindowControls.tsx                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React from "react";
import { Minus, Square, X } from "lucide-react";
import { cx } from "@/shared/ui/shared/classNames";
import { isDesktop, windowControls } from "../model/desktop";

const BASE = "inline-flex h-7 w-11 items-center justify-center text-[var(--osio-fg-muted)] transition-colors hover:bg-[var(--osio-bg-hover)] hover:text-[var(--osio-fg-default)] focus-visible:outline-none";

/** Minimize / maximize / close — rendered only inside a desktop shell. */
export const WindowControls: React.FC = () => {
  const controls = isDesktop() ? windowControls() : null;
  if (!controls) return null;
  // no-drag keeps these clickable inside the draggable titlebar region (desktop).
  return (
    <div className="flex items-center" style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}>
      <button type="button" aria-label="Minimize window" className={BASE} onClick={controls.minimize}>
        <Minus size={15} aria-hidden />
      </button>
      <button type="button" aria-label="Maximize window" className={BASE} onClick={controls.toggleMaximize}>
        <Square size={12} aria-hidden />
      </button>
      <button
        type="button"
        aria-label="Close window"
        className={cx(BASE, "hover:bg-[var(--osio-danger)] hover:text-[var(--osio-accent-fg)]")}
        onClick={controls.close}
      >
        <X size={16} aria-hidden />
      </button>
    </div>
  );
};
