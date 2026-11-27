/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   agentToolEvents.ts                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/05/18 21:19:22 by dlesieur          #+#    #+#             */
/*   Updated: 2026/05/18 21:19:22 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */


import type { AgentToolEvent } from "./types";

/** The line shown while a tool runs: its name and a clipped copy of its input. */
export function toolDetail(name: string, input: unknown) {
  const suffix = input && typeof input === "object" && Object.keys(input).length > 0
    ? ` with ${JSON.stringify(input).slice(0, 180)}`
    : "";
  return `Running ${name}${suffix}`;
}

/** One clipped line out of a tool's result text. */
export function resultSummary(text: string) {
  if (!text.trim()) return "Tool completed.";
  return text.replaceAll(/\s+/g, " ").slice(0, 260);
}

/** Replaces the event with the same id, or appends it. */
export function upsertToolEvent(events: AgentToolEvent[] | undefined, nextEvent: AgentToolEvent) {
  const existing = events ?? [];
  return existing.some((event) => event.id === nextEvent.id)
    ? existing.map((event) => event.id === nextEvent.id ? { ...event, ...nextEvent } : event)
    : [...existing, nextEvent];
}

/** Patches the event with that id; the others are untouched. */
export function updateToolEvent(events: AgentToolEvent[] | undefined, toolId: string, patch: Partial<AgentToolEvent>) {
  return (events ?? []).map((event) => event.id === toolId ? { ...event, ...patch } : event);
}
