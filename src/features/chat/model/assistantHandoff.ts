/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   assistantHandoff.ts                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */
/**
 * The hand-off from a block to the Assistant: an image that asked to be asked
 * about.
 *
 * Three pieces:
 *
 * - {@link mediaPathOfAsset} turns the asset of a block into the path the
 *   service will serve — and into NOTHING when the asset is not one of ours (a
 *   link, a `data:` URL, an entry of the gallery). The service accepts one
 *   shape only, and a URL never leaves the browser (devil C80).
 * - {@link useAssistantHandoff} carries the hand-off from the block to the
 *   Assistant. It lives in MEMORY: nothing is persisted, and the hand-off is
 *   taken once. The image is sent only when the user presses Send (devil C79).
 * - {@link subscribeAssistantHandoff} hands it over: to the Assistant that is
 *   already open, and to the one that opens after it.
 */

import { create } from "zustand";

/* -------------------------------------------------------------------------- */
/* The path                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * The path of an image the service will serve — the ONE shape it accepts.
 *
 * Copied from the service's own contract (services/osionos-ai/src/routes/runs.ts:30):
 * the uuid of the upload, then the sha256 of the bytes and its extension. The
 * case-insensitive flag is the service's own, so the client accepts exactly
 * what the service will serve.
 */
const MEDIA_PATH = /^\/api\/media\/uploads\/([0-9a-f-]{36})\/([0-9a-f]{64}\.[a-z0-9]{1,8})$/i;

/** The prefix an asset carries when it holds a URL. */
const URL_PREFIX = "url:";

/** The bridge base, without its trailing slash: the path follows it. */
function baseOf(apiBase: string): string {
  return apiBase.trim().replace(/\/+$/, "");
}

/**
 * The path of an image the Assistant may read, or null.
 *
 * The asset of a block is `url:<the bridge's base><the path>` (or the path
 * alone). Only a path the service will serve is a hand-off: a `data:` URL, a
 * picture of somebody else's, an entry of the gallery or a path of another
 * shape is NOT — the service would refuse it, and a URL never leaves the
 * browser (devil C80).
 */
export function mediaPathOfAsset(asset: string | undefined, apiBase: string): string | null {
  if (!asset) return null;
  let rest = asset.startsWith(URL_PREFIX) ? asset.slice(URL_PREFIX.length) : asset;
  const base = baseOf(apiBase);
  if (base && rest.startsWith(base)) rest = rest.slice(base.length);
  return MEDIA_PATH.test(rest) ? rest : null;
}

/* -------------------------------------------------------------------------- */
/* The hand-off                                                               */
/* -------------------------------------------------------------------------- */

/** An attachment of the composer: where it is stored, what to call it, and what the chip shows. */
export interface ComposerAttachment {
  path: string;
  name: string;
  kind: "image" | "file";
}

/** What one block hands over to the Assistant. */
export interface AssistantHandoff {
  /** The paths of the images (bridge capability paths). */
  attachments: string[];
  /** The text that comes with them. */
  text: string;
}

interface AssistantHandoffState {
  /** The hand-off waiting for the Assistant, or null. */
  pending: AssistantHandoff | null;
  /** Puts a hand-off on the table. */
  handOff: (pending: AssistantHandoff) => void;
  /** Takes the hand-off and clears it: it is handed over once. */
  take: () => AssistantHandoff | null;
}

/**
 * The hand-off, in memory.
 *
 * NEVER persisted: a hand-off that outlived the tab would attach an image the
 * user never asked about. The store holds ONE hand-off, and the Assistant
 * takes it once.
 */
export const useAssistantHandoff = create<AssistantHandoffState>((set, get) => ({
  pending: null,

  handOff: (pending) => set({ pending }),

  take: () => {
    const pending = get().pending;
    if (!pending) return null;
    set({ pending: null });
    return pending;
  },
}));

/**
 * Subscribes to the hand-off.
 *
 * The callback is called with the hand-off that is ALREADY waiting (the
 * Assistant was not open when the block handed the image over) and with every
 * hand-off that lands after. Each one is taken as it is delivered: it is
 * handed over once.
 */
export function subscribeAssistantHandoff(onHandoff: (pending: AssistantHandoff) => void): () => void {
  const deliver = (pending: AssistantHandoff | null): void => {
    if (!pending) return;
    onHandoff(pending);
    useAssistantHandoff.getState().take();
  };
  deliver(useAssistantHandoff.getState().pending);
  return useAssistantHandoff.subscribe((state) => deliver(state.pending));
}

/* -------------------------------------------------------------------------- */
/* The merge                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * The attachments of the composer with the ones of a hand-off: no duplicate,
 * and never more than the composer holds.
 */
export function mergeAttachments(
  existing: readonly ComposerAttachment[],
  incoming: readonly ComposerAttachment[],
  max: number,
): ComposerAttachment[] {
  const merged = [...existing];
  for (const attachment of incoming) {
    if (merged.some((current) => current.path === attachment.path)) continue;
    if (merged.length >= max) break;
    merged.push(attachment);
  }
  return merged;
}

/**
 * The attachments of a run: a media path is read by its capability path (with
 * the name the reader sees), anything else is a chat upload id.
 */
export function toRunAttachments(
  attachments: readonly ComposerAttachment[],
): Array<{ kind: "chat"; id: string } | { kind: "media"; path: string; name?: string }> {
  return attachments.map(({ path, name }) =>
    path.startsWith("/api/media/")
      ? { kind: "media" as const, path, name }
      : { kind: "chat" as const, id: path.split("/").pop() ?? "" },
  );
}
