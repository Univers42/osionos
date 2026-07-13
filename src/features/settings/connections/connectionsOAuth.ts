/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   connectionsOAuth.ts                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/12 00:00:00 by dlesieur          #+#    #+#             */
/*                                                +#+#+#+#+#+   +#+           */
/* ************************************************************************** */

import { getActivePageJwt } from "@/shared/api/client";
import type { ConnApp } from "./connectionsCatalog";

/** osionos bridge base URL; blank in the offline/Playwright build. */
function apiBase(): string {
  const raw = (import.meta.env.VITE_API_URL as string | undefined) ?? "";
  return raw.replace(/\/$/, "");
}

/**
 * Start a REAL OAuth connect for a `live` app (the Google family). Asks the
 * bridge (authenticated) for the provider consent URL — which carries a signed
 * state binding this account — then redirects the browser to it. On callback the
 * bridge exchanges the code and persists the connection owner-scoped, so the
 * app-session token is sent as a header, never placed in a URL.
 *
 * Resolves true when a redirect was initiated (the caller must then NOT also
 * record a local connection). Resolves false when there is no bridge (offline
 * build), the app is not live-OAuth, or the provider is not configured yet — the
 * caller falls back to a workspace registry entry, keeping the catalog usable.
 */
export async function beginConnect(app: ConnApp, userId: string): Promise<boolean> {
  const base = apiBase();
  const token = getActivePageJwt();
  if (!base || !app.live || !token) return false;
  try {
    const res = await fetch(`${base}/api/app-connections/oauth/${encodeURIComponent(app.id)}/start`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ userId, returnTo: window.location.href }),
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { authorizeUrl?: string };
    if (!data.authorizeUrl) return false;
    window.location.assign(data.authorizeUrl);
    return true;
  } catch {
    return false; // provider not reachable/configured → fall back to registry add
  }
}
