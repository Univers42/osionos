/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   knownDatabaseFlushSchedule.ts                      :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/17 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/17 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// When the known-database state is written: once per burst of edits, after a debounce and in an
// idle period, so serializing the whole state never lands while the user is still typing.

const FLUSH_DELAY_MS = 1000;
const IDLE_TIMEOUT_MS = 2000;

type RequestIdle = (callback: IdleRequestCallback, options?: IdleRequestOptions) => number;
type CancelIdle = (handle: number) => void;
type IdleGlobals = typeof globalThis & { requestIdleCallback?: RequestIdle; cancelIdleCallback?: CancelIdle };

export interface FlushSchedule {
  /** Asks for a flush; repeated calls within the debounce make one flush. */
  schedule(): void;
  cancel(): void;
}

export function createFlushSchedule(flush: () => void): FlushSchedule {
  let microtaskQueued = false;
  let debounceHandle: ReturnType<typeof globalThis.setTimeout> | null = null;
  let idleHandle: number | null = null;
  let timeoutHandle: ReturnType<typeof globalThis.setTimeout> | null = null;

  const scheduleIdle = (): void => {
    if (idleHandle !== null || timeoutHandle !== null) return;
    const requestIdle = (globalThis as IdleGlobals).requestIdleCallback;
    if (requestIdle) {
      // A busy (or headless) page may grant no idle period at all; without a
      // timeout the save waited for the next edit or unload (seen: >8 s).
      // Caveat: an edit is still unsaved for up to debounce + timeout (3 s); a
      // tab crash in that window loses it (a normal close flushes on unload).
      idleHandle = requestIdle(() => {
        idleHandle = null;
        flush();
      }, { timeout: IDLE_TIMEOUT_MS });
      return;
    }
    timeoutHandle = globalThis.setTimeout(() => {
      timeoutHandle = null;
      flush();
    }, 0);
  };

  const scheduleDebounced = (): void => {
    if (debounceHandle !== null) globalThis.clearTimeout(debounceHandle);
    debounceHandle = globalThis.setTimeout(() => {
      debounceHandle = null;
      scheduleIdle();
    }, FLUSH_DELAY_MS);
  };

  const cancelIdle = (): void => {
    if (idleHandle === null) return;
    const cancel = (globalThis as IdleGlobals).cancelIdleCallback;
    if (cancel) cancel(idleHandle);
    else globalThis.clearTimeout(idleHandle);
    idleHandle = null;
  };

  return {
    schedule: () => {
      if (microtaskQueued) return;
      microtaskQueued = true;
      queueMicrotask(() => {
        microtaskQueued = false;
        scheduleDebounced();
      });
    },
    cancel: () => {
      if (debounceHandle !== null) globalThis.clearTimeout(debounceHandle);
      if (timeoutHandle !== null) globalThis.clearTimeout(timeoutHandle);
      debounceHandle = null;
      timeoutHandle = null;
      cancelIdle();
    },
  };
}
