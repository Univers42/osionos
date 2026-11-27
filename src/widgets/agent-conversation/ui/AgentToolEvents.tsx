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
import { CheckCircle2, Loader2, XCircle } from "lucide-react";

import type { AgentToolEvent } from "../model/types";

/** The tools a turn ran, one box each, with their status and detail. */
export const AgentToolEvents: React.FC<{ events: AgentToolEvent[] }> = ({ events }) => (
  <div className="mt-3 grid gap-2" data-agent-tool-list="true">
    {events.map((event) => (
      <div key={event.id} data-agent-tool={event.name} className="rounded-md border border-[var(--osio-border-default)] bg-[var(--osio-bg-subtle)] px-2.5 py-2 text-xs text-[var(--osio-fg-muted)]">
        <div className="mb-1 flex items-center gap-2 font-medium text-[var(--osio-fg-default)]">
          {event.status === "running" ? <Loader2 size={12} className="animate-spin" aria-hidden="true" /> : null}
          {event.status === "complete" ? <CheckCircle2 size={12} aria-hidden="true" /> : null}
          {event.status === "error" ? <XCircle size={12} aria-hidden="true" /> : null}
          <span>{event.name}</span>
        </div>
        <p>{event.detail}</p>
      </div>
    ))}
  </div>
);
