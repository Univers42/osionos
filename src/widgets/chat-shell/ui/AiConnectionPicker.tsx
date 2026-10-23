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
  selectionSeesImages,
  writeAiSelection,
  type AiSelection,
} from "@/features/ai/model/aiSelection";
import { DEVICE_CONNECTION_ID, readDeviceEngine } from "@/features/ai/model/deviceEngine";

interface Props {
  /** The choice right now. */
  value: AiSelection;
  /** The user picked another one. */
  onChange: (selection: AiSelection) => void;
  /**
   * Whether the chosen model sees images — null while the service has not
   * said. An unknown is not a "no": a picture that is already attached waits
   * for the answer instead of being dropped.
   */
  onVisionChange?: (sees: boolean | null) => void;
}

export const AiConnectionPicker: React.FC<Props> = ({ value, onChange, onVisionChange }) => {
  const [connections, setConnections] = useState<AiConnection[]>([]);
  const [serviceModels, setServiceModels] = useState<Record<string, AiModel[]>>({});

  const [deviceEngine] = useState(readDeviceEngine);

  const modelsByConnection = React.useMemo(
    () =>
      deviceEngine
        ? { ...serviceModels, [DEVICE_CONNECTION_ID]: [{ id: deviceEngine.model, label: deviceEngine.model, default: true }] }
        : serviceModels,
    [deviceEngine, serviceModels],
  );

  // The callback lives in a ref: a parent that builds it anew on every render
  // must not restart the loading.
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  // The same for the second callback: it only carries a fact, never a load.
  const onVisionChangeRef = useRef(onVisionChange);
  useEffect(() => {
    onVisionChangeRef.current = onVisionChange;
  }, [onVisionChange]);

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
    const ids = Array.from(new Set([PLATFORM_CONNECTION_ID, value.connectionId])).filter(
      (id) => id !== DEVICE_CONNECTION_ID,
    );
    void Promise.all(
      ids.map(async (id) => [id, await listModels(id)] as const),
    )
      .then((entries) => {
        if (!alive) return;
        setServiceModels(Object.fromEntries(entries));
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [value.connectionId]);

  // A stale choice is fixed here, quietly: the platform connection and its
  // default model.
  useEffect(() => {
    if (connections.length === 0 && !deviceEngine) return;
    const availableConnections = deviceEngine
      ? [...connections, { id: DEVICE_CONNECTION_ID }]
      : connections;
    const resolved = resolveAiSelection(value, availableConnections, modelsByConnection);
    if (resolved.connectionId === value.connectionId && resolved.model === value.model) return;
    apply(resolved);
  }, [apply, connections, deviceEngine, modelsByConnection, value]);

  // Whether the chosen model sees images. The picker is the one that holds the
  // models, so it is the one that says: the composer only shows the button.
  //
  // Null while the service has not answered — the picture waits for the word.
  // A choice that names no model of the list (the one the service has not
  // resolved yet, or a model that is gone) is an unknown too: answering "no"
  // there would drop a picture over a choice that is about to be made.
  const models = modelsByConnection[value.connectionId] ?? [];
  const chosen = models.some((model) => model.id === value.model);
  const sees = chosen ? selectionSeesImages(value, modelsByConnection) : null;
  useEffect(() => {
    onVisionChangeRef.current?.(sees);
  }, [sees]);

  const connectionOptions = [
    ...connections.map((connection) => ({
      value: connection.id,
      label: connection.label,
    })),
    ...(deviceEngine ? [{ value: DEVICE_CONNECTION_ID, label: "This device" }] : []),
  ];
  const modelOptions = (modelsByConnection[value.connectionId] ?? []).map((model) => ({
    value: model.id,
    label: model.vision ? `${model.label} (sees images)` : model.label,
  }));

  const onConnectionChange = (nextId: string) => {
    if (nextId === DEVICE_CONNECTION_ID && deviceEngine) {
      apply({ connectionId: nextId, model: deviceEngine.model });
      return;
    }
    const models = modelsByConnection[nextId] ?? [];
    if (models.length > 0) {
      apply({ connectionId: nextId, model: defaultModelId(models) });
      return;
    }
    // The models of a connection we have not seen yet.
    void listModels(nextId)
      .then((list) => {
        setServiceModels((current) => ({ ...current, [nextId]: list }));
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
