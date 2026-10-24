/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ideKeys.ts                                           :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/24 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/24 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The sandbox plane has no database, so the keys travel through the client: read the account keys
// from the main bridge, hand the ssh ones to the plane, which re-validates every pair.

import { api, getActivePageJwt } from "@/shared/api/client";

import { ideFetch } from "../api/ideTransport";

import { sshItemsOf, type SyncKey } from "./ideVigilant";

export async function fetchSshKeys(): Promise<SyncKey[]> {
  return sshItemsOf(await api.get<unknown>("/api/account/keys", getActivePageJwt() ?? undefined));
}

/** Replaces the sandbox's allowed_signers with `keys`. False when the plane refused or is off. */
export async function syncIdeKeys(workspaceId: string, keys: readonly SyncKey[]): Promise<boolean> {
  const result = await ideFetch(workspaceId, "/api/ide/keys/sync", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ workspaceId, keys }),
  });
  if (result.kind !== "response" || !result.response.ok) return false;
  const body = (await result.response.json().catch(() => ({}))) as { ok?: boolean };
  return body.ok === true;
}
