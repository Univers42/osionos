/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   useTypingMembers.ts                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/27 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/27 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The set of member ids typing right now, for the roster. One shared timeout, set
 * to the moment the soonest typist goes idle, serves every avatar: nothing polls
 * and nothing runs while nobody types. The state holds the SET, so the roster
 * re-renders when somebody starts or stops, not on every remote keystroke.
 */

import { useEffect, useState } from 'react';

import { useRemoteEditStore } from '../model/remoteEditStore';
import { nextTypingExpiry, typingMembers } from '../model/typingActivity';

const NOBODY: ReadonlySet<string> = new Set();
/** Added to the wake-up so it lands after the cutoff, never a frame before it. */
const WAKE_SLACK_MS = 20;

function sameMembers(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  if (a.size !== b.size) return false;
  for (const id of a) if (!b.has(id)) return false;
  return true;
}

export function useTypingMembers(): ReadonlySet<string> {
  const [typing, setTyping] = useState<ReadonlySet<string>>(NOBODY);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const sync = (): void => {
      clearTimeout(timer);
      const { editedAt } = useRemoteEditStore.getState();
      const now = Date.now();
      const next = typingMembers(editedAt, now);
      setTyping((prev) => (sameMembers(prev, next) ? prev : next));
      const wake = nextTypingExpiry(editedAt, now);
      if (wake !== null) timer = setTimeout(sync, wake + WAKE_SLACK_MS);
    };
    sync();
    const unsubscribe = useRemoteEditStore.subscribe((state, previous) => {
      if (state.editedAt !== previous.editedAt) sync();
    });
    return () => { unsubscribe(); clearTimeout(timer); };
  }, []);

  return typing;
}
