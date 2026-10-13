/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   fakeClock.ts                                       :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// A manual clock for timer-driven code: `schedule` has the shape the inbound
// session injects, and nothing runs until the test calls `advance`. Test-only:
// due callbacks are found by a linear scan per advance.

export type Schedule = (run: () => void, ms: number) => () => void;

export interface FakeClock {
  readonly schedule: Schedule;
  /** Moves time forward and runs every callback that fell due, in due order. */
  advance(ms: number): void;
  /** Callbacks scheduled and neither run nor cancelled. */
  pendingCount(): number;
}

export function createFakeClock(): FakeClock {
  let now = 0;
  let nextId = 0;
  const due = new Map<number, { at: number; run: () => void }>();
  return {
    schedule(run, ms) {
      const id = nextId++;
      due.set(id, { at: now + ms, run });
      return () => { due.delete(id); };
    },
    advance(ms) {
      now += ms;
      const ready = [...due.entries()].filter(([, timer]) => timer.at <= now).sort((a, b) => a[1].at - b[1].at || a[0] - b[0]);
      for (const [id, timer] of ready) {
        due.delete(id);
        timer.run();
      }
    },
    pendingCount: () => due.size,
  };
}
