/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   webSettings.ts                                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/21 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/21 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */


/**
 * The web tools of the assistant, from the side of the client.
 *
 * Three layers must all be on before a run can search the web or read a page:
 * the server flag, the switch of the workspace, and the toggle of THIS
 * message. The client owns the last two. The server flag speaks through a 404
 * on the settings route: the feature is off, and no web control is drawn.
 *
 * Pure logic, no React: the hook is useWebSettings.ts, the controls are
 * ChatComposer's toggle and the settings row.
 */

import { AiError, getWebSettings, putWebSettings } from "@/features/ai/api/aiClient";

/** What the reader is told before the web is used (C357) — shown verbatim, never reworded. */
export const WEB_DISCLOSURE =
  "Queries and the pages you fetch are sent to third-party search engines and websites.";

/** Where the switch of a workspace stands, as the SERVER says it. */
export type WebSettingsView =
  | { status: "loading" }
  | { status: "off" }
  | { status: "failed" }
  | { status: "ready"; enabled: boolean };

/**
 * The switch of a workspace. A 404 is "feature off" (the flag, or a caller who
 * is no member): the view is `off` and nothing is drawn. Any other failure is
 * `failed`, never "on".
 */
export async function loadWebView(workspaceId: string): Promise<WebSettingsView> {
  try {
    const settings = await getWebSettings(workspaceId);
    return { status: "ready", enabled: settings.enabled === true };
  } catch (failure) {
    return { status: failure instanceof AiError && failure.status === 404 ? "off" : "failed" };
  }
}

/** The outcome of a save: the switch the server holds, or the words for the reader. */
export type WebSaveResult = { ok: true; enabled: boolean } | { ok: false; words: string };

/** The words of a refusal of the switch. Plain text: the reader acts on it. */
export function webSaveWords(failure: unknown): string {
  if (!(failure instanceof AiError)) return "Could not save.";
  if (failure.status === 403 && failure.code === "reauth_required") {
    return "Your session is too old for this change. Sign in again, then try once more.";
  }
  if (failure.status === 403) return "Only a workspace owner or admin can change this.";
  if (failure.status === 400) return "The notice was not confirmed, so nothing changed.";
  return "Could not save.";
}

/**
 * Writes the switch. It is the CONFIRM step: the settings row calls it from
 * its confirm button only, and the body always carries `acknowledged: true`.
 */
export async function saveWebAccess(workspaceId: string, enabled: boolean): Promise<WebSaveResult> {
  try {
    const saved = await putWebSettings(workspaceId, enabled);
    return { ok: true, enabled: saved.enabled === true };
  } catch (failure) {
    return { ok: false, words: webSaveWords(failure) };
  }
}
