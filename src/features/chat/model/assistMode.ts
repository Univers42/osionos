/**
 * How the assistant applies edits (AM10): the client of
 * `GET|PATCH /conversations/:id/mode` and the words of its refusals.
 *
 * The transport is aiClient's `requestJson` (session bearer, base URL, refusal
 * envelope); nothing is copied. The body of a PATCH holds only `mode` and
 * `anchorPageId`: the service answers any other key with a 400.
 *
 * Caveat: a 404 means "the service offers no modes" (flag off) but is also what
 * a conversation the caller does not own answers, so the menu hides in both.
 */

import { AiError } from "@/features/ai/api/aiContract";
import { requestJson } from "@/features/ai/api/aiClient";

export type AssistMode = "manual" | "plan" | "accept_edits" | "auto";
export type ModeFailure = "reauth_required" | "modes_not_enabled" | "anchor_invalid" | "error";

export const ASSIST_MODES: ReadonlyArray<{ mode: AssistMode; label: string }> = [
  { mode: "manual", label: "Manual" },
  { mode: "plan", label: "Plan" },
  { mode: "accept_edits", label: "Accept edits" },
  { mode: "auto", label: "Auto" },
];

const path = (conversationId: string) => `/conversations/${encodeURIComponent(conversationId)}/mode`;

export async function getMode(conversationId: string): Promise<{ mode: AssistMode; anchorPageId: string | null }> {
  return requestJson("GET", path(conversationId));
}

/** The failure a refused or broken call stands for. */
export function failureOf(cause: unknown): ModeFailure {
  if (!(cause instanceof AiError)) return "error";
  if (cause.status === 404 || cause.code === "modes_not_enabled") return "modes_not_enabled";
  if (cause.code === "reauth_required" || cause.code === "anchor_invalid") return cause.code;
  return "error";
}

export async function patchMode(
  conversationId: string,
  body: { mode: AssistMode; anchorPageId?: string },
): Promise<{ ok: true } | { ok: false; code: ModeFailure }> {
  try {
    await requestJson("PATCH", path(conversationId), body);
    return { ok: true };
  } catch (cause) {
    return { ok: false, code: failureOf(cause) };
  }
}

const SENTENCES: Record<ModeFailure, string> = {
  reauth_required: "Sign in again to allow automatic edits",
  modes_not_enabled: "",
  anchor_invalid: "This page cannot be used as the anchor",
  error: "The mode could not be changed",
};

/** What the menu shows for a failure: a sentence, or nothing at all when the service offers no modes. */
export function modeFeedback(code: ModeFailure): { error: string | null; hidden: boolean } {
  return code === "modes_not_enabled" ? { error: null, hidden: true } : { error: SENTENCES[code], hidden: false };
}

export type ModeLoad = { status: "ready"; mode: AssistMode } | { status: "failed"; hidden: boolean };

/**
 * The first read of a conversation's mode. The menu stays disabled until it is
 * "ready", and a failed read shows an alert instead of a mode.
 *
 * Caveat: a failed read gives up for the life of the menu (no retry); the
 * server may hold any mode, so showing "Manual" there would misstate it.
 */
export async function loadMode(conversationId: string): Promise<ModeLoad> {
  try {
    return { status: "ready", mode: (await getMode(conversationId)).mode };
  } catch (cause) {
    return { status: "failed", hidden: modeFeedback(failureOf(cause)).hidden };
  }
}
