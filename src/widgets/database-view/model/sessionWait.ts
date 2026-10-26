/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   sessionWait.ts                                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/26 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/26 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Runs `start` once a session exists: at once if it does, else on a retry tick,
 * or as soon as a poke finds it (the app pokes when a sign-in lands). A poke
 * that finds no session leaves the pending tick alone, so a page mounting many
 * database blocks does not use up the attempts. After `maxAttempts` ticks
 * without a session it gives up; the next poke starts a fresh wait.
 */

export type SessionWait = { poke: () => void; cancel: () => void };

export function createSessionWait(options: {
  hasSession: () => boolean;
  start: () => void;
  retryMs: number;
  maxAttempts: number;
}): SessionWait {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let attempts = 0;

  const attempt = (): void => {
    timer = null;
    if (options.hasSession()) {
      attempts = 0;
      options.start();
      return;
    }
    attempts += 1;
    if (attempts < options.maxAttempts) timer = setTimeout(attempt, options.retryMs);
    else attempts = 0;
  };

  const cancel = (): void => {
    if (timer) clearTimeout(timer);
    timer = null;
    attempts = 0;
  };

  return {
    poke: () => {
      if (timer && !options.hasSession()) return;
      if (timer) clearTimeout(timer);
      attempt();
    },
    cancel,
  };
}
