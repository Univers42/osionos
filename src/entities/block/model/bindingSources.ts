/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bindingSources.ts                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/25 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/25 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { createContext, useCallback, useContext, useState, useSyncExternalStore } from "react";
import { useBoundRecord, resolveBoundField } from "./binding";

export type FieldDisplay =
  | "text" | "email" | "url" | "number" | "password" | "multiline" | "switch"
  | "checkbox" | "dropdown" | "segmented" | "radio" | "checkbox-list" | "search"
  | "image" | "file";

export interface FieldSpec {
  key: string;
  display: FieldDisplay;
  label: string;
  options?: readonly { value: string; label: string }[];
  readOnly?: boolean;
  validate?(value: unknown): string | null;
}

export type SourceStatus = "ready" | "loading" | "unavailable";

export interface RecordSource {
  id: string;
  label: string;
  fields: readonly FieldSpec[];
  status(): SourceStatus;
  get(field: string): unknown;
  subscribe(field: string, onChange: () => void): () => void;
  set?(field: string, value: unknown): void;
  load?(): void;
}

export interface BoundField {
  value: unknown;
  status: SourceStatus;
  spec: FieldSpec | null;
  set: ((value: unknown) => void) | null;
  error: string | null;
}

export interface BindingSources {
  get(id: string): RecordSource | undefined;
}

export const BindingSourcesContext = createContext<BindingSources | null>(null);

export function createStoreRecordSource<S>(input: {
  id: string;
  label: string;
  fields: readonly FieldSpec[];
  store: { getState(): S; subscribe(listener: (state: S, previous: S) => void): () => void };
  read(state: S): Record<string, unknown> | null;
  isLoading(state: S): boolean;
  write?(patch: Record<string, unknown>): void;
  load?(): void;
}): RecordSource {
  const listeners = new Map<string, Set<() => void>>();
  let storeUnsub: (() => void) | null = null;

  const totalListeners = (): number => {
    let total = 0;
    for (const set of listeners.values()) total += set.size;
    return total;
  };

  const dropStoreSub = (): void => {
    if (storeUnsub) {
      storeUnsub();
      storeUnsub = null;
    }
  };

  const ensureStoreSub = (): void => {
    if (storeUnsub) return;
    storeUnsub = input.store.subscribe((next, previous) => {
      // Only fields with active listeners are compared; cost is O(subscribed fields).
      for (const [field, set] of listeners) {
        if (set.size === 0) continue;
        const prevRecord = input.read(previous);
        const nextRecord = input.read(next);
        const prevValue = prevRecord && Object.hasOwn(prevRecord, field) ? prevRecord[field] : undefined;
        const nextValue = nextRecord && Object.hasOwn(nextRecord, field) ? nextRecord[field] : undefined;
        if (!Object.is(prevValue, nextValue)) {
          for (const cb of [...set]) cb();
        }
      }
    });
  };

  const source: RecordSource = {
    id: input.id,
    label: input.label,
    fields: input.fields,
    status(): SourceStatus {
      const record = input.read(input.store.getState());
      if (record !== null) return "ready";
      return input.isLoading(input.store.getState()) ? "loading" : "unavailable";
    },
    get(field: string): unknown {
      const record = input.read(input.store.getState());
      if (!record || !Object.hasOwn(record, field)) return undefined;
      return record[field];
    },
    subscribe(field: string, onChange: () => void): () => void {
      let set = listeners.get(field);
      if (!set) {
        set = new Set();
        listeners.set(field, set);
      }
      const wasEmpty = totalListeners() === 0;
      set.add(onChange);
      if (wasEmpty) {
        ensureStoreSub();
        // First subscriber kicks off loading; idempotent upstream.
        if (input.load) input.load();
      }
      return () => {
        const current = listeners.get(field);
        if (current) {
          current.delete(onChange);
          if (current.size === 0) listeners.delete(field);
        }
        if (totalListeners() === 0) dropStoreSub();
      };
    },
    set: input.write
      ? (field: string, value: unknown) => {
          const spec = input.fields.find((candidate) => candidate.key === field);
          if (spec?.readOnly) return;
          if (spec?.validate) {
            const message = spec.validate(value);
            if (message) return;
          }
          input.write!({ [field]: value });
        }
      : undefined,
    load: input.load ? () => input.load!() : undefined,
  };

  return source;
}

export function useBoundField(recordRef: string | undefined, field: string | undefined): BoundField {
  const sources = useContext(BindingSourcesContext);
  const isContextRecord = recordRef === "$record" || recordRef === "$viewedUser";

  const source = !isContextRecord && typeof recordRef === "string" && recordRef.startsWith("settings:")
    ? sources?.get(recordRef)
    : undefined;

  const subscribe = useCallback(
    (cb: () => void) => (source && field ? source.subscribe(field, cb) : () => {}),
    [source, field],
  );
  const getSnapshot = useCallback(
    () => (source && field ? source.get(field) : undefined),
    [source, field],
  );

  const externalValue = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const record = useBoundRecord();

  const [error, setError] = useState<string | null>(null);

  const spec = source ? source.fields.find((candidate) => candidate.key === field) ?? null : null;

  // $record / $viewedUser resolve through the existing bound record, read-only.
  if (isContextRecord) {
    const value = resolveBoundField(record, field);
    return { value, status: "ready", spec: null, set: null, error: null };
  }

  const status: SourceStatus = source ? source.status() : "unavailable";

  const set = source?.set && spec && !spec.readOnly && field
    ? (value: unknown) => {
        const message = spec.validate ? spec.validate(value) : null;
        if (message) {
          setError(message);
          return;
        }
        setError(null);
        source.set!(field, value);
      }
    : null;

  const value = source ? externalValue : undefined;

  return { value, status, spec, set, error };
}
