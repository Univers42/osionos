/**
 * The composer's model picker when no AI service is configured.
 *
 * Offline, the app's own connectors stand in for providers, so the models on
 * offer are the ones of the connected connectors — the service-backed
 * AiConnectionPicker has nothing to list there.
 */

import React, { useMemo } from "react";

import { Dropdown } from "@/shared/ui";
import { useConnectorStore } from "@/features/connectors/model/useConnectorStore";
import type { AiSelection } from "@/features/ai/model/aiSelection";

interface Props {
  value: AiSelection;
  onChange: (selection: AiSelection) => void;
}

export const OfflineModelPicker: React.FC<Props> = ({ value, onChange }) => {
  const snapshots = useConnectorStore((s) => s.snapshots);
  const options = useMemo(() => {
    const models = Object.values(snapshots)
      .filter((snap) => snap.state === "connected")
      .flatMap((snap) =>
        snap.models.map((model) => ({ value: model.id, label: model.displayName, description: snap.displayName })),
      );
    return [{ value: "auto", label: "Auto", description: "Best available model" }, ...models];
  }, [snapshots]);

  return (
    <span data-testid="model-picker">
      <Dropdown
        label="Model"
        variant="inline"
        width={220}
        value={value.model || "auto"}
        options={options}
        onChange={(model) => onChange({ connectionId: value.connectionId, model })}
      />
    </span>
  );
};
