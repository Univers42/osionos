/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   useComposerWarning.ts                              :+:      :+:    :+:   */
/*                                                    +#+  :+:         :+:     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  :+:       +#+        */
/*                                                +#+#+#+#+   +#+           */
/*   Created: 2026/10/22 15:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 15:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The composer's answer to L0's warning.
 *
 * The draft STAYS when the bridge asks the author first: the notice shows
 * above the input, "Post anyway" resends the text and the attachments with
 * the author's answer, and "Edit" closes the notice and puts the caret back
 * in the text. A write that failed keeps the draft too — nothing the author
 * typed is ever lost.
 *
 * The answer `onSend` gives is read HERE, so the composer takes both
 * contracts: the old boolean (true wrote, false did not) and the typed
 * outcome ({ ok:true } | { ok:false, warning } | { ok:false }).
 */

import { useCallback, useState, type RefObject } from 'react';

import type { Attachment } from '@/shared/chat/messageApi';
import type { ModerationWarning } from '@/shared/moderation/moderationWarning';

/** How a composer sends. The answer is the typed outcome, or the old boolean. */
export type ComposerSend = (
  text: string,
  attachments?: Attachment[],
  options?: { acknowledgeWarning?: boolean },
) => Promise<unknown> | unknown;

/** What an answer means: it wrote, it failed, or L0 asked first. */
export interface ComposerAnswer {
  ok: boolean;
  warning: ModerationWarning | null;
}

/**
 * Reads what `onSend` answered: the typed outcome, or the old boolean
 * (false is a failure, anything else wrote).
 */
export function readAnswer(answer: unknown): ComposerAnswer {
  if (answer === false) return { ok: false, warning: null };
  if (answer && typeof answer === 'object' && 'ok' in answer) {
    const outcome = answer as { ok: boolean; warning?: ModerationWarning };
    return { ok: outcome.ok === true, warning: outcome.warning ?? null };
  }
  return { ok: true, warning: null };
}

interface ComposerWarningDeps {
  onSend: ComposerSend;
  /** The draft as it stands: what a "post anyway" resends. */
  text: string;
  attachments: Attachment[];
  /** Clears the draft (the write happened). */
  reset: () => void;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
}

/**
 * The warning the composer shows, and the two answers to it: edit the text, or
 * post it anyway.
 */
export function useComposerWarning({ onSend, text, attachments, reset, textareaRef }: ComposerWarningDeps) {
  const [warning, setWarning] = useState<ModerationWarning | null>(null);

  /**
   * Send the draft. A warning keeps it (the author answers L0), a write that
   * happened clears it, any other failure keeps it too.
   */
  const submit = useCallback(async (options?: { acknowledgeWarning?: boolean }): Promise<boolean> => {
    let answer: unknown;
    try {
      answer = await onSend(text, attachments, options);
    } catch {
      return false; // nothing was written: the draft stays
    }
    const outcome = readAnswer(answer);
    if (outcome.warning) {
      setWarning(outcome.warning);
      return false;
    }
    if (!outcome.ok) return false;
    setWarning(null);
    reset();
    return true;
  }, [onSend, text, attachments, reset]);

  /** "Edit": close the notice and put the caret back in the text. */
  const edit = useCallback(() => {
    setWarning(null);
    textareaRef.current?.focus();
  }, [textareaRef]);

  return { warning, submit, edit };
}
