/**
 * The asker's "@AI" draft above the composer (C429, C453): only they see it,
 * it says what was sent to the model, and nothing reaches the channel until
 * they press Post.
 */

import React from "react";
import { Sparkles } from "lucide-react";

import { Button } from "@/shared/ui";

import type { AiDraft } from "../model/aiAnswerDraft";

const FAILURES: Record<string, string> = {
  rate_limited: "Too many @AI requests in this channel right now. Try again in a few minutes.",
  rate_limit_unavailable: "@AI is unavailable right now. Try again later.",
  trigger_stale: "That message is too old for @AI. Ask again in a new message.",
  trigger_changed: "Your message changed or was deleted. Ask again.",
  context_changed: "A message in this channel changed since the draft. Draft it again.",
  answer_stale: "This draft is too old to post. Draft it again.",
  answer_blocked: "This draft breaks the channel rules and cannot be posted.",
  access_revoked: "You no longer have access to this channel.",
  budget_exhausted: "The AI budget for today is used up.",
  not_found: "@AI cannot read this channel.",
  empty_answer: "The AI wrote nothing. Draft it again.",
};

function failureText(code: string | null): string {
  return (code && FAILURES[code]) || "The draft failed. Try again.";
}

interface AiDraftCardProps {
  draft: AiDraft;
  onAccept: () => void;
  onPost: () => void;
  onRetry: () => void;
  onDiscard: () => void;
}

export const AiDraftCard: React.FC<AiDraftCardProps> = ({ draft, onAccept, onPost, onRetry, onDiscard }) => (
  <section
    aria-label="AI draft, visible only to you"
    className="mb-2 rounded-lg border border-[var(--osio-border-default)] bg-[var(--osio-bg-subtle)] px-3 py-2 text-sm"
  >
    <header className="flex items-center gap-2 text-xs text-[var(--osio-fg-muted)]">
      <Sparkles size={14} aria-hidden className="text-[var(--osio-accent)]" />
      <span className="font-semibold text-[var(--osio-fg-default)]">AI draft</span>
      <span>Only you can see this.</span>
    </header>
    {draft.status === "notice" ? (
      <div className="mt-2 space-y-2">
        <p>
          To draft an answer, @AI sends your message and up to 30 recent messages of this channel to the
          platform AI model. Nothing is posted until you press Post.
        </p>
        <div className="flex gap-2">
          <Button tone="primary" size="sm" onClick={onAccept}>Draft an answer</Button>
          <Button tone="ghost" size="sm" onClick={onDiscard}>Not now</Button>
        </div>
      </div>
    ) : (
      <div className="mt-2 space-y-2">
        <p className="whitespace-pre-wrap break-words leading-6" aria-live="polite">
          {draft.text || (draft.status === "drafting" ? "Drafting…" : "")}
        </p>
        {draft.status === "error" && <p role="alert" className="text-[var(--osio-danger)]">{failureText(draft.code)}</p>}
        <p className="text-xs text-[var(--osio-fg-subtle)]">
          Drafted by the platform AI model from your message and the recent messages of this channel.
        </p>
        <div className="flex gap-2">
          <Button tone="primary" size="sm" disabled={draft.status !== "ready"} onClick={onPost}>
            {draft.status === "posting" ? "Posting…" : "Post"}
          </Button>
          {draft.status === "error" && <Button tone="ghost" size="sm" onClick={onRetry}>Draft again</Button>}
          <Button tone="ghost" size="sm" onClick={onDiscard}>Discard</Button>
        </div>
      </div>
    )}
  </section>
);
