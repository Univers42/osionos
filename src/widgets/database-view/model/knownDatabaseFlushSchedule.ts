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

interface Handles {
  readonly flush: () => void;
  microtaskQueued: boolean;
  debounce: ReturnType<typeof globalThis.setTimeout> | null;
  idle: number | null;
  timeout: ReturnType<typeof globalThis.setTimeout> | null;
}

function scheduleIdle(handles: Handles): void {
  if (handles.idle !== null || handles.timeout !== null) return;
  const requestIdle = (globalThis as IdleGlobals).requestIdleCallback;
  if (requestIdle) {
    // A busy (or headless) page may grant no idle period at all; without a
    // timeout the save waited for the next edit or unload (seen: >8 s).
    // Caveat: an edit is still unsaved for up to debounce + timeout (3 s); a
    // tab crash in that window loses it (a normal close flushes on unload).
    handles.idle = requestIdle(() => {
      handles.idle = null;
      handles.flush();
    }, { timeout: IDLE_TIMEOUT_MS });
    return;
  }
  handles.timeout = globalThis.setTimeout(() => {
    handles.timeout = null;
    handles.flush();
  }, 0);
}

function scheduleDebounced(handles: Handles): void {
  if (handles.debounce !== null) globalThis.clearTimeout(handles.debounce);
  handles.debounce = globalThis.setTimeout(() => {
    handles.debounce = null;
    scheduleIdle(handles);
  }, FLUSH_DELAY_MS);
}

function schedule(handles: Handles): void {
  if (handles.microtaskQueued) return;
  handles.microtaskQueued = true;
  queueMicrotask(() => {
    handles.microtaskQueued = false;
    scheduleDebounced(handles);
  });
}

function cancel(handles: Handles): void {
  if (handles.debounce !== null) globalThis.clearTimeout(handles.debounce);
  if (handles.timeout !== null) globalThis.clearTimeout(handles.timeout);
  handles.debounce = null;
  handles.timeout = null;
  if (handles.idle === null) return;
  const cancelIdle = (globalThis as IdleGlobals).cancelIdleCallback;
  if (cancelIdle) cancelIdle(handles.idle);
  else globalThis.clearTimeout(handles.idle);
  handles.idle = null;
}

export function createFlushSchedule(flush: () => void): FlushSchedule {
  const handles: Handles = { flush, microtaskQueued: false, debounce: null, idle: null, timeout: null };
  return { schedule: () => schedule(handles), cancel: () => cancel(handles) };
}
