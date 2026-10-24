/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   voiceClient.ts                                     :+:      :+:    :+:   */
/*                                                   lis        lis    lis     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  lis       lis        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/21 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/21 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The client of the dictation route.
 *
 * The audio goes to the AI service — the one the assistant already talks to —
 * with the session bearer of the app, exactly like every other route of
 * `aiClient.ts`. The service answers `{ text }`, and the text goes to the
 * caller's editor.
 */

import { bearerFetch } from "@/shared/agent/bearerFetch";
import { getActivePageJwt } from "@/shared/api/client";

/** The minimal fetch shape, so a test can inject a stub without a network. */
type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/** The languages the dictation may ask for. */
export const DICTATION_LANGUAGES = ["auto", "en", "fr", "es", "de", "it", "pt"] as const;

export type DictationLanguage = (typeof DICTATION_LANGUAGES)[number];

/** A refusal of the service, with the sentence the user reads. */
export class VoiceError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "VoiceError";
    this.status = status;
    this.code = code;
  }
}

/**
 * The base URL of the service, without a trailing slash.
 *
 * `VITE_AI_URL` is the switch of the assistant; `VITE_API_URL` is the bridge's
 * URL, and it is set in every build — it is the fallback of the route, never
 * of the assistant itself.
 */
function serviceBase(): string {
  const env = (import.meta.env ?? {}) as Record<string, string>;
  const base = (env["VITE_AI_URL"] ?? env["VITE_API_URL"] ?? "").trim();
  return base.replace(/\/$/, "");
}

/** The full URL of the dictation route. */
export function voiceUrl(language: DictationLanguage = "auto"): string {
  return `${serviceBase()}/api/ai/voice/transcribe?lang=${encodeURIComponent(language)}`;
}

/** The transport every call uses: the session bearer, like the agent stream. */
let transport: FetchLike = bearerFetch((input, init) => fetch(input, init), getActivePageJwt);

/** Swaps the transport. The tests use it; the app never calls it. */
export function setVoiceTransport(impl: FetchLike): void {
  transport = impl;
}

/** The sentence the user reads, for each refusal of the service. */
export function messageFor(status: number, code: string, retryAfter?: number | null): string {
  if (status === 413) return "Dictation is limited to 30 seconds.";
  if (status === 429) {
    if (code === "voice_busy") return "Another dictation is already running.";
    const wait = retryAfter ? ` Try again in ${Math.ceil(retryAfter / 60)} minute(s).` : "";
    return `You have used your dictation time for today.${wait}`;
  }
  if (status === 503) return "Voice dictation is not set up on this server.";
  if (status === 504) return "The dictation took too long. Try again.";
  if (status === 415) return "This browser cannot send the audio the server expects.";
  if (status === 400) return "The recording was not understood. Try again.";
  if (status === 401) return "Your session has expired. Sign in again.";
  return "The dictation failed. Try again.";
}

/** The text of a dictation. */
export async function transcribeVoice(
  wav: Uint8Array,
  options: { language?: DictationLanguage; signal?: AbortSignal } = {},
): Promise<string> {
  const response = await transport(voiceUrl(options.language ?? "auto"), {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "audio/wav" },
    body: wav as unknown as BodyInit,
    ...(options.signal ? { signal: options.signal } : {}),
  });
  if (!response.ok) {
    const code = await codeOf(response);
    const retryAfter = Number(response.headers.get("retry-after"));
    throw new VoiceError(
      response.status,
      code,
      messageFor(response.status, code, Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : null),
    );
  }
  const body = (await response.json().catch(() => null)) as { text?: unknown } | null;
  if (!body || typeof body.text !== "string") {
    throw new VoiceError(502, "voice_failed", "The dictation failed. Try again.");
  }
  return body.text;
}

/** The code of a refusal, read out of the envelope of the service. */
async function codeOf(response: Response): Promise<string> {
  try {
    const body = (await response.clone().json()) as { error?: { code?: string }; code?: string } | null;
    return body?.error?.code ?? body?.code ?? "voice_failed";
  } catch {
    return "voice_failed";
  }
}
