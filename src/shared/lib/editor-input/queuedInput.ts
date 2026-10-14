/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   queuedInput.ts                                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Editables batch keystrokes into one change per animation frame. Anything that commits the
// block drafts must first flush that batch, or the batch fires AFTER the commit's rewrite and
// writes the old text back: "/quote" stayed in the block after Enter picked Quote, because the
// slash menu takes Enter in the capture phase and the editable's own keydown flush never ran.

const queuedFlushes = new Set<() => void>();

/** Registers the flush of a batch waiting for its frame; call the returned release when the
 * batch is emitted or dropped. */
export function queueInputFlush(flush: () => void): () => void {
  queuedFlushes.add(flush);
  return () => {
    queuedFlushes.delete(flush);
  };
}

/** Emits every batch still waiting for its frame, now. */
export function flushQueuedInput(): void {
  if (queuedFlushes.size === 0) return;
  // A flush releases itself and may queue another batch: walk a snapshot.
  for (const flush of Array.from(queuedFlushes)) flush();
}
