/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   AgentToolEvents.tsx                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/05/18 21:19:22 by dlesieur          #+#    #+#             */
/*   Updated: 2026/05/18 21:19:22 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */


import React from "react";
import { CheckCircle2, ChevronRight, Loader2, XCircle } from "lucide-react";

import type { AgentToolEvent, AgentToolStatus } from "../model/types";

/** The status icon of a tool row; the status is also written for screen readers by the caller. */
const StatusIcon: React.FC<{ status: AgentToolStatus }> = ({ status }) => {
  if (status === "running") return <Loader2 size={14} className="shrink-0 animate-spin motion-reduce:animate-none" aria-hidden="true" />;
  if (status === "complete") return <CheckCircle2 size={14} className="shrink-0 text-[var(--osio-success)]" aria-hidden="true" />;
  return <XCircle size={14} className="shrink-0 text-[var(--osio-danger)]" aria-hidden="true" />;
};

/** The tools a turn ran: one compact row each, the full detail one click away. */
export const AgentToolEvents: React.FC<{ events: AgentToolEvent[] }> = ({ events }) => (
  <div className="mt-2 grid gap-1" data-agent-tool-list="true">
    {events.map((event) => (
      <details key={event.id} data-agent-tool={event.name} className="group rounded-[var(--osio-radius-chip)] bg-[var(--osio-bg-subtle)] text-xs text-[var(--osio-fg-muted)]">
        <summary className="flex cursor-pointer list-none items-center gap-2 rounded-[var(--osio-radius-chip)] px-2.5 py-1.5 hover:bg-[var(--osio-bg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--osio-focus-ring-color)] [&::-webkit-details-marker]:hidden">
          <StatusIcon status={event.status} />
          <span className="sr-only">{event.status}:</span>
          <span className="shrink-0 font-medium text-[var(--osio-fg-default)]">{event.name}</span>
          <span className="min-w-0 flex-1 truncate">{event.detail}</span>
          <ChevronRight size={12} aria-hidden="true" className="shrink-0 transition-transform group-open:rotate-90 motion-reduce:transition-none" />
        </summary>
        <p className="whitespace-pre-wrap break-words px-2.5 pb-2 pt-1">{event.detail}</p>
      </details>
    ))}
  </div>
);
