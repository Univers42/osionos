/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   aiConnectionControls.tsx                           :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/21 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/21 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React from "react";
import { Check, TriangleAlert } from "lucide-react";

import type { AiConnection } from "@/features/ai/api/aiClient";
import { CHIP } from "./aiPanelClasses";

/** The chip that says how a connection stands. */
export const StatusChip: React.FC<{ connection: AiConnection }> = ({ connection }) => {
  if (connection.status === "ok") {
    return (
      <span className={`${CHIP} bg-[var(--osio-bg-muted)] text-[var(--osio-fg-default)]`}>
        <Check size={11} aria-hidden /> Working
      </span>
    );
  }
  if (connection.status === "error") {
    return (
      <span className={`${CHIP} bg-[var(--osio-danger)]/12 text-[var(--osio-danger)]`}>
        <TriangleAlert size={11} aria-hidden /> {connection.statusMessage || "Not working"}
      </span>
    );
  }
  return <span className={`${CHIP} bg-[var(--osio-bg-muted)] text-[var(--osio-fg-muted)]`}>Not tested</span>;
};

/** The card of one way to connect. */
export const ChoiceCard: React.FC<{
  title: string;
  hint: string;
  action: React.ReactNode;
  children?: React.ReactNode;
}> = ({ title, hint, action, children }) => (
  <div className="rounded-lg border border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)] p-3">
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div className="min-w-0">
        <div className="text-sm font-medium text-[var(--osio-fg-default)]">{title}</div>
        <p className="mt-0.5 text-xs leading-[16px] text-[var(--osio-fg-muted)]">{hint}</p>
      </div>
      <div className="shrink-0">{action}</div>
    </div>
    {children ? <div className="mt-3 space-y-3">{children}</div> : null}
  </div>
);
