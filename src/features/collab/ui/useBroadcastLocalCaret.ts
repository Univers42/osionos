/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   useBroadcastLocalCaret.ts                          :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/26 17:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/26 17:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Broadcasts THIS client's caret/selection to the Shared space (AOC §3). The
 * browser fires `selectionchange` on every keystroke and arrow press, so updates
 * are coalesced to at most one broadcast PER ANIMATION FRAME and de-duplicated
 * (no resend when the caret didn't actually move). A monotone `seq` lets remote
 * reducers reject out-of-order frames. This is the only outbound caret path.
 */

import { useEffect, useRef } from 'react';

import { readLocalCaretAndSelection } from '../model/localCaret';
import { useCollabStore } from '../store/useCollabStore';

export function useBroadcastLocalCaret(active: boolean): void {
  const broadcast = useCollabStore((state) => state.broadcast);
  const nextSeq = useCollabStore((state) => state.nextSeq);
  const self = useCollabStore((state) => state.self);
  const last = useRef('');
  const raf = useRef<number | null>(null);

  useEffect(() => {
    if (!active || !self || typeof document === 'undefined') return undefined;

    const flush = () => {
      raf.current = null;
      const { caret, selection } = readLocalCaretAndSelection();
      if (selection) {
        const key = `s:${selection.anchor.blockId}:${selection.anchor.offset}:${selection.focus.blockId}:${selection.focus.offset}`;
        if (key === last.current) return;
        last.current = key;
        broadcast({ t: 'selection', actor: self.id, seq: nextSeq(), range: selection });
      } else if (caret) {
        const key = `c:${caret.blockId}:${caret.offset}`;
        if (key === last.current) return;
        last.current = key;
        broadcast({ t: 'caret', actor: self.id, seq: nextSeq(), caret });
      }
    };
    const schedule = () => { if (raf.current == null) raf.current = requestAnimationFrame(flush); };

    document.addEventListener('selectionchange', schedule);
    return () => {
      document.removeEventListener('selectionchange', schedule);
      if (raf.current != null) cancelAnimationFrame(raf.current);
    };
  }, [active, self, broadcast, nextSeq]);
}
