/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ModelPicker.tsx                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useMemo } from "react";

import { Dropdown } from "@/shared/ui/primitives/Dropdown";
import { useConnectorStore } from "@/features/connectors/model/useConnectorStore";

/** Encode/decode a picker value: "auto" or "<providerKey>:<modelId>". */
export function resolveModel(value: string, fallbackConnector: string): { connectorId: string; model: string } {
  if (value === "auto" || !value.includes(":")) return { connectorId: fallbackConnector, model: "auto" };
  const [connectorId, ...rest] = value.split(":");
  return { connectorId, model: rest.join(":") };
}

/** Model picker driven by CONNECTED connectors' models (never a hardcoded list). */
export const ModelPicker: React.FC<{ value: string; onChange: (value: string) => void }> = ({ value, onChange }) => {
  const snapshots = useConnectorStore((s) => s.snapshots);
  const options = useMemo(() => {
    const models = Object.values(snapshots)
      .filter((snap) => snap.state === "connected")
      .flatMap((snap) => snap.models.map((model) => ({
        value: `${snap.providerKey}:${model.id}`,
        label: model.displayName,
        description: snap.displayName,
      })));
    return [{ value: "auto", label: "Auto", description: "Best available model" }, ...models];
  }, [snapshots]);

  return (
    <span data-testid="model-picker">
      <Dropdown value={value} options={options} onChange={onChange} align="start" width={240} />
    </span>
  );
};
