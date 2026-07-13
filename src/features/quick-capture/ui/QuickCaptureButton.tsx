/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   QuickCaptureButton.tsx                             :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/12 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/12 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React from "react";
import { PenLine } from "lucide-react";
import { isQuickCaptureEnabled } from "@/shared/config/featureFlags";
import { useQuickCapture } from "../model/useQuickCapture";

/** Top-bar affordance that opens the quick-capture modal. */
export const QuickCaptureButton: React.FC = () => {
  if (!isQuickCaptureEnabled()) return null;
  return (
    <button
      type="button"
      title="Quick capture"
      aria-label="Quick capture"
      onClick={() => useQuickCapture.getState().setOpen(true)}
      className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--osio-radius-chip)] text-[var(--osio-fg-muted)] transition-colors duration-[var(--osio-dur-fast)] hover:bg-[var(--osio-bg-hover)] hover:text-[var(--osio-fg-default)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--osio-focus-ring-color)]"
    >
      <PenLine size={16} />
    </button>
  );
};
