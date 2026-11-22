/**
 * The lasting composer marker of an auto-post channel (osio-bot OB3): every
 * member, not only the asker, sees that an "@ai" message is answered in the
 * channel without review.
 */

import React from "react";
import { Sparkles } from "lucide-react";

export const AiAutopostMarker: React.FC<{ autopost: boolean }> = ({ autopost }) =>
  autopost ? (
    <p role="note" className="mb-1 flex items-center gap-1 text-xs text-[var(--osio-fg-muted)]">
      <Sparkles size={12} aria-hidden className="text-[var(--osio-accent)]" />
      <span>@ai answers post here</span>
    </p>
  ) : null;
