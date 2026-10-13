/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   inboundFlushWindow.ts                              :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// When the drain's deferred creates are due (C3b5 P1): a quiet timer restarted by
// every create, and a deadline started by the first one — whichever ends first.
// Creates from MANY socket messages then share one batch (one index rebuild)
// instead of one flush per message. The timers only call `due`; the caller turns
// that into a queued flush (B8), never a flush from the timer itself.

import type { Schedule } from "./inboundPending";

/** No new create for this long ends the window. */
export const FLUSH_QUIET_MS = 4;
/** The window never outlives this, however steadily creates keep coming. */
export const FLUSH_MAX_MS = 50;

export interface FlushWindow {
  /** A create was deferred: restart the quiet timer; the first one also starts the deadline. */
  touch(): void;
  /** Disarms both timers (the batch was flushed, or the session ended). */
  stop(): void;
}

export interface FlushWindowDeps {
  schedule: Schedule;
  /** Called once per window, from a timer, when it ends. */
  due(): void;
}

/**
 * Ponytail: wall-clock timers, so a hidden tab's throttling (inboundLive.ts)
 * stretches the window — creates land late, never lost or reordered. A trickle
 * slower than FLUSH_QUIET_MS (a build writing a file every 10 ms) still gets one
 * flush per create. The 4 ms / 50 ms figures were sized on the fixture store
 * (tests/bench/inbound-burst.bench.ts), not on the live store's round trips.
 */
export function createFlushWindow(deps: FlushWindowDeps): FlushWindow {
  let quiet: (() => void) | null = null;
  let deadline: (() => void) | null = null;
  const stop = (): void => {
    quiet?.();
    deadline?.();
    quiet = null;
    deadline = null;
  };
  const end = (): void => {
    stop();
    deps.due();
  };
  return {
    touch() {
      quiet?.();
      quiet = deps.schedule(end, FLUSH_QUIET_MS);
      deadline ??= deps.schedule(end, FLUSH_MAX_MS);
    },
    stop,
  };
}
