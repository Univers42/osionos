/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   useWebSettings.ts                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/21 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/21 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */


/**
 * The switch of a workspace, read from the server when the workspace is known.
 *
 * The answer is tagged with its workspace: another workspace is "loading"
 * until its own answer lands, so a switch is never drawn from the last one.
 */

import { useCallback, useEffect, useMemo, useState } from "react";

import { loadWebView, type WebSettingsView } from "./webSettings";

export function useWebSettings(workspaceId: string, active = true): { view: WebSettingsView; set: (view: WebSettingsView) => void } {
  const [answer, setAnswer] = useState<{ workspaceId: string; view: WebSettingsView } | null>(null);
  const view = useMemo<WebSettingsView>(
    () => (!active ? { status: "off" } : answer?.workspaceId === workspaceId ? answer.view : { status: "loading" }),
    [answer, workspaceId, active],
  );
  const set = useCallback((next: WebSettingsView) => setAnswer({ workspaceId, view: next }), [workspaceId]);

  useEffect(() => {
    if (!active || !workspaceId) return undefined;
    let alive = true;
    void loadWebView(workspaceId).then((next) => alive && set(next));
    return () => {
      alive = false;
    };
  }, [workspaceId, active, set]);
  return { view, set };
}
