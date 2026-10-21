/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   AiConnectionPicker.tsx                             :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/21 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/21 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The composer's picker: a connection, then a model.
 *
 * The options come from the service (the user's own connections and the models
 * each of them offers), never from a list written in the app. The choice is
 * remembered on the device under ONE key, so the inline "Ask AI" panel speaks
 * with the same voice as the Assistant.
 *
 * The choice can go stale — the connection was removed. The picker resolves it
 * against what the service says now, and falls back to the platform
 * connection without saying anything.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";

import { Dropdown } from "@/shared/ui";
import { listConnections, listModels, type AiConnection, type AiModel } from "@/features/ai/api/aiClient";
import {
  PLATFORM_CONNECTION_ID,
  defaultModelId,
  resolveAiSelection,
  writeAiSelection,
  type AiSelection,
} from "@/features/ai/model/aiSelection";

interface Props {
  /** The choice right now. */
  value: AiSelection;
  /** The user picked another one. */
  onChange: (selection: AiSelection) => void;
}

export const AiConnectionPicker: React.FC<Props> = ({ value, onChange }) => {
  const [connections, setConnections] = useState<AiConnection[]>([]);
  const [modelsByConnection, setModelsByConnection] = useState<Record<string, AiModel[]>>({});

  // The callback lives in a ref: a parent that builds it anew on every render
  // must not restart the loading.
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const apply = useCallback((next: AiSelection) => {
    writeAiSelection(next);
    onChangeRef.current(next);
  }, []);

  // The connections, once.
  useEffect(() => {
    let alive = true;
    void listConnections()
      .then((list) => {
        if (alive) setConnections(list);
      })
      .catch(() => {
        // No service, no connections: the run falls back to the platform one.
      });
    return () => {
      alive = false;
    };
  }, []);

  // The models of the chosen connection — and of the platform one, which is
  // where a stale choice lands.
  useEffect(() => {
    let alive = true;
    const ids = Array.from(new Set([PLATFORM_CONNECTION_ID, value.connectionId]));
    void Promise.all(
      ids.map(async (id) => [id, await listModels(id)] as const),
    )
      .then((entries) => {
        if (alive) setModelsByConnection(Object.fromEntries(entries));
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [value.connectionId]);

  // A stale choice is fixed here, quietly: the platform connection and its
  // default model.
  useEffect(() => {
    if (connections.length === 0) return;
    const resolved = resolveAiSelection(value, connections, modelsByConnection);
    if (resolved.connectionId === value.connectionId && resolved.model === value.model) return;
    apply(resolved);
  }, [apply, connections, modelsByConnection, value]);

  const connectionOptions = connections.map((connection) => ({
    value: connection.id,
    label: connection.label,
  }));
  const modelOptions = (modelsByConnection[value.connectionId] ?? []).map((model) => ({
    value: model.id,
    label: model.label,
  }));

  const onConnectionChange = (nextId: string) => {
    const models = modelsByConnection[nextId] ?? [];
    if (models.length > 0) {
      apply({ connectionId: nextId, model: defaultModelId(models) });
      return;
    }
    // The models of a connection we have not seen yet.
    void listModels(nextId)
      .then((list) => {
        setModelsByConnection((current) => ({ ...current, [nextId]: list }));
        apply({ connectionId: nextId, model: defaultModelId(list) });
      })
      .catch(() => undefined);
  };

  return (
    <span className="flex items-center gap-1" data-testid="ai-connection-picker">
      <Dropdown
        label="Connection"
        variant="inline"
        width={200}
        value={value.connectionId}
        options={connectionOptions}
        onChange={onConnectionChange}
        placeholder="Connection"
      />
      <Dropdown
        label="Model"
        variant="inline"
        width={220}
        value={value.model}
        options={modelOptions}
        onChange={(model) => apply({ connectionId: value.connectionId, model })}
        placeholder="Model"
      />
    </span>
  );
};
