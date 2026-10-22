/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   settingsHydration.ts                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The one hydration primitive of the settings panels: a panel says "loading",
// then "ready" or "couldn't load", and an answer that arrives too late never
// overwrites a newer one. The state machine is pure so a canvas test can pin
// it; the hook below is its only driver.
//
// `runAsync` stays fire-and-forget for writes: a write that fails is reported
// by the action itself, while a READ has to say out loud that it did not arrive.

import { useCallback, useEffect, useReducer, useRef, useState, type DependencyList } from "react";

export type SettingsHydrationStatus = "loading" | "ready" | "error";

export interface SettingsHydrationState {
  status: SettingsHydrationStatus;
  error: string | null;
  /** The load this state belongs to: an answer from an older one is stale. */
  generation: number;
  /** True once the panel went away: a late answer must not touch the state. */
  unmounted: boolean;
}

export type SettingsHydrationEvent =
  | { type: "load"; generation: number }
  | { type: "settle"; generation: number; error?: string | null }
  | { type: "unmount" };

export const INITIAL_HYDRATION_STATE: SettingsHydrationState = {
  status: "loading",
  error: null,
  generation: 0,
  unmounted: false,
};

/**
 * The one transition table of the hydration machine.
 *
 * An answer only counts when it belongs to the load that is on screen (the
 * generation) and the panel is still there (not unmounted): a load that was
 * replaced, or a panel that was closed, keeps what it showed.
 */
export function nextHydrationState(
  state: SettingsHydrationState,
  event: SettingsHydrationEvent,
): SettingsHydrationState {
  if (event.type === "unmount") {
    return state.unmounted ? state : { ...state, unmounted: true };
  }
  if (event.type === "load") {
    return { status: "loading", error: null, generation: event.generation, unmounted: false };
  }
  if (state.unmounted || event.generation !== state.generation) return state;
  if (event.error) return { ...state, status: "error", error: event.error };
  return { ...state, status: "ready", error: null };
}

export interface SettingsHydration {
  status: SettingsHydrationStatus;
  error: string | null;
  /** Runs the load again, from the top. */
  retry: () => void;
}

function failureMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return "These settings could not be loaded.";
}

/**
 * Loads a panel's data and says what happened.
 *
 * `deps` are the ids the load depends on: when one of them changes, the load
 * runs again and the panel goes back to "loading". The list must keep its
 * length between renders, like any React dependency list.
 */
export function useSettingsHydration(
  load: () => Promise<unknown>,
  deps: DependencyList,
): SettingsHydration {
  const [state, dispatch] = useReducer(nextHydrationState, INITIAL_HYDRATION_STATE);
  const [retryToken, setRetryToken] = useState(0);
  const loadRef = useRef(load);
  const generationRef = useRef(0);

  // A panel hands over a new closure on every render; the load below must not
  // restart for that alone, so the loader is read from a ref instead.
  useEffect(() => {
    loadRef.current = load;
  }, [load]);

  useEffect(() => {
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    dispatch({ type: "load", generation });
    void Promise.resolve()
      .then(() => loadRef.current())
      .then(
        () => {
          dispatch({ type: "settle", generation });
        },
        (error: unknown) => {
          dispatch({ type: "settle", generation, error: failureMessage(error) });
        },
      );
    return () => {
      // The panel is gone, or its inputs changed: a late answer must not land.
      dispatch({ type: "unmount" });
    };
    // The caller's deps ARE the reload trigger, so the spread is the API.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the dependency list is the caller's, by design
  }, [...deps, retryToken]);

  const retry = useCallback(() => {
    setRetryToken((token) => token + 1);
  }, []);

  return { status: state.status, error: state.error, retry };
}
