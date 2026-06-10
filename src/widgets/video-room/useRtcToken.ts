/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   useRtcToken.ts                                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/10 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/10 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Fetches a LiveKit access grant from the bridge (POST /api/rtc/token,
 * scripts/bridge-rtc.mjs): ABAC-checked server-side against
 * osionos_workspace_members, returns the signed room token plus the
 * browser-facing LiveKit URL.
 */

import { useCallback, useEffect, useState } from "react";
import { ApiError, api, getActiveJwt } from "@/shared/api/client";

export interface RtcGrant {
  token: string;
  url: string;
  room: string;
  identity: string;
  workspaceId: string;
  role: string;
  expiresAt: string;
}

export interface RtcTokenRequest {
  channelId: string;
  room?: string;
  workspaceId?: string;
  displayName?: string;
}

export interface RtcTokenState {
  grant: RtcGrant | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

interface RtcTokenResult {
  key: string;
  grant: RtcGrant | null;
  error: string | null;
}

export function useRtcToken(request: RtcTokenRequest): RtcTokenState {
  const [result, setResult] = useState<RtcTokenResult | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const { channelId, room, workspaceId, displayName } = request;
  const requestKey = [channelId, room, workspaceId, displayName, reloadKey].join("|");

  useEffect(() => {
    if (!channelId) return;
    let active = true;
    api
      .post<RtcGrant & { ok: boolean }>(
        "/api/rtc/token",
        { channelId, room, workspaceId, displayName },
        getActiveJwt() ?? undefined,
      )
      .then((response) => {
        if (active) setResult({ key: requestKey, grant: response, error: null });
      })
      .catch((cause: unknown) => {
        if (!active) return;
        setResult({
          key: requestKey,
          grant: null,
          error: cause instanceof ApiError ? cause.message : "Could not get a call token.",
        });
      });
    return () => {
      active = false;
    };
  }, [channelId, room, workspaceId, displayName, requestKey]);

  const refresh = useCallback(() => setReloadKey((key) => key + 1), []);
  const current = result && result.key === requestKey ? result : null;

  return {
    grant: current?.grant ?? null,
    loading: Boolean(channelId) && !current,
    error: channelId ? current?.error ?? null : "channelId is required.",
    refresh,
  };
}
