/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   sudoPromptModel.ts                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The state of the one sudo prompt and the words it uses.
 *
 * `startSudoListener` is the only subscriber of `onSudoRequired` in the app: a panel
 * never handles a 403 itself. On success the prompt closes and `grants` goes up, so a
 * panel that was refused re-enables its "Try again" button; nothing re-sends by itself.
 */

import { create } from 'zustand';

import { onSudoRequired } from '@/shared/api/sudoRequired';

interface SudoPromptStore {
  open: boolean;
  /** Counts successful grants; a panel watches it to offer "Try again". */
  grants: number;
  show: () => void;
  dismiss: () => void;
  granted: () => void;
}

export const useSudoPromptStore = create<SudoPromptStore>()((set) => ({
  open: false,
  grants: 0,
  show: () => set({ open: true }),
  dismiss: () => set({ open: false }),
  granted: () => set((state) => ({ open: false, grants: state.grants + 1 })),
}));

/** Opens the prompt on every `sudo_required` refusal. Returns the unsubscribe. */
export function startSudoListener(): () => void {
  return onSudoRequired(() => useSudoPromptStore.getState().show());
}

const SENTENCES: Record<string, string> = {
  code_invalid: 'That code is not right. Check the six digits and try again.',
  code_expired: 'That code has expired. Ask for a new one.',
  code_locked: 'Too many wrong codes. Ask for a new code later.',
  sudo_unavailable: 'Confirming it is you is not available right now. Try again shortly.',
  sudo_proof_invalid: 'That code could not be confirmed. Ask for a new one.',
};

const GENERIC = 'That did not work. Try again.';

function waitPhrase(seconds: number | null | undefined): string {
  if (!seconds || seconds <= 0) return 'a little later';
  if (seconds < 60) return `in ${Math.ceil(seconds)} seconds`;
  const minutes = Math.ceil(seconds / 60);
  return `in ${minutes} minute${minutes === 1 ? '' : 's'}`;
}

/** One sentence for a server code; a 429 says when to retry. */
export function sudoSentence(failure: { code: string; retryAfterSeconds?: number | null }): string {
  if (failure.code === 'rate_limited') return `Too many tries. Try again ${waitPhrase(failure.retryAfterSeconds)}.`;
  return SENTENCES[failure.code] ?? GENERIC;
}
