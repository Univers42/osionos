/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   sentiment.ts                                       :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/21 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/21 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The client of the sentiment routes of the AI service (M6): the opt-in switch
 * of a workspace, its weekly Pulse, and the mood of a comment thread.
 *
 * The transport is the one of every AI route (`requestJson`); the answers are
 * checked by the pure parsers of the model before anything reads them.
 */

import { AiError } from "./aiContract";
import { requestJson } from "./aiClient";
import {
  parsePulse,
  parseSettings,
  parseThreadMood,
  type Pulse,
  type ThreadMood,
} from "@/features/ai/model/sentimentPulse";

const malformed = (): AiError => new AiError(502, "bad_answer", "The AI service answered something unexpected.");

const workspacePath = (workspaceId: string): string => `/workspaces/${encodeURIComponent(workspaceId)}/sentiment`;

/** `GET /workspaces/:id/sentiment/settings` — is the sentiment on? */
export async function getSentimentSettings(workspaceId: string): Promise<boolean> {
  const settings = parseSettings(await requestJson<unknown>("GET", `${workspacePath(workspaceId)}/settings`));
  if (!settings) throw malformed();
  return settings.enabled;
}

/** `PUT /workspaces/:id/sentiment/settings` — owner or admin only; a 403 is an AiError. */
export async function setSentimentEnabled(workspaceId: string, enabled: boolean): Promise<boolean> {
  const settings = parseSettings(await requestJson<unknown>("PUT", `${workspacePath(workspaceId)}/settings`, { enabled }));
  if (!settings) throw malformed();
  return settings.enabled;
}

/** `GET /workspaces/:id/sentiment/pulse?weeks=` — the weekly totals. */
export async function getPulse(workspaceId: string, weeks = 12): Promise<Pulse> {
  const pulse = parsePulse(await requestJson<unknown>("GET", `${workspacePath(workspaceId)}/pulse?weeks=${weeks}`));
  if (!pulse) throw malformed();
  return pulse;
}

/** `GET /pages/:id/sentiment/mood` — the mood of a thread, or null when there is none to show. */
export async function getThreadMood(pageId: string): Promise<ThreadMood | null> {
  return parseThreadMood(await requestJson<unknown>("GET", `/pages/${encodeURIComponent(pageId)}/sentiment/mood`));
}
