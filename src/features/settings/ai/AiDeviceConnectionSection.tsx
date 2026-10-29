/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   AiDeviceConnectionSection.tsx                      :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/23 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/23 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useEffect, useState } from "react";

import { validateDeviceUrl, readDeviceEngine, writeDeviceEngine, clearDeviceEngine } from "@/features/ai/model/deviceEngine";
import { ChoiceCard } from "./aiConnectionControls";
import { PRIMARY_BUTTON, SECONDARY_BUTTON } from "./aiPanelClasses";

export const AiDeviceConnectionSection: React.FC = () => {
  const [deviceUrl, setDeviceUrl] = useState("");
  const [deviceModel, setDeviceModel] = useState("");
  const [deviceKey, setDeviceKey] = useState("");
  const [deviceTestResult, setDeviceTestResult] = useState("");
  const [deviceBusy, setDeviceBusy] = useState(false);
  const [deviceError, setDeviceError] = useState("");

  useEffect(() => {
    const engine = readDeviceEngine();
    if (engine) {
      setDeviceUrl(engine.baseUrl);
      setDeviceModel(engine.model);
      setDeviceKey(engine.apiKey ?? "");
    }
  }, []);

  const saveDevice = () => {
    const check = validateDeviceUrl(deviceUrl);
    if (!check.ok) { setDeviceError(check.message); return; }
    if (!deviceModel.trim()) { setDeviceError("Enter the model name your engine serves."); return; }
    writeDeviceEngine({ baseUrl: check.baseUrl, model: deviceModel.trim(), ...(deviceKey.trim() ? { apiKey: deviceKey.trim() } : {}) });
    setDeviceError("");
    setDeviceTestResult("");
  };

  const removeDevice = () => {
    clearDeviceEngine();
    setDeviceUrl("");
    setDeviceModel("");
    setDeviceKey("");
    setDeviceTestResult("");
    setDeviceError("");
  };

  const testDevice = async () => {
    const check = validateDeviceUrl(deviceUrl);
    if (!check.ok) { setDeviceError(check.message); return; }
    setDeviceBusy(true);
    setDeviceError("");
    try {
      const headers: Record<string, string> = {};
      if (deviceKey.trim()) headers["Authorization"] = `Bearer ${deviceKey.trim()}`;
      const response = await fetch(`${check.baseUrl}/v1/models`, { method: "GET", headers, targetAddressSpace: "loopback" } as RequestInit);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const json = (await response.json()) as { data?: Array<{ id?: string }>; models?: Array<{ id?: string }> };
      const ids = (json.data ?? json.models ?? []).map((entry) => entry?.id).filter((id): id is string => typeof id === "string");
      setDeviceTestResult(ids.join(", "));
    } catch (failure) {
      setDeviceError(failure instanceof Error ? failure.message : "The engine could not be reached.");
    } finally {
      setDeviceBusy(false);
    }
  };

  const origin = typeof window !== "undefined" ? window.location.origin : "";

  return (
    <ChoiceCard
      title="This device"
      hint="Your own engine, on your machine: Ollama, llama.cpp, LM Studio, opencode serve."
      action={
        <span className="flex gap-2">
          <button type="button" onClick={() => void testDevice()} disabled={deviceBusy} className={SECONDARY_BUTTON}>
            Test
          </button>
          <button type="button" onClick={saveDevice} className={PRIMARY_BUTTON}>
            Save
          </button>
          <button type="button" onClick={removeDevice} className={SECONDARY_BUTTON}>
            Remove
          </button>
        </span>
      }
    >
      <div className="space-y-3">
        <div>
          <label className="block text-xs text-[var(--osio-fg-muted)]" htmlFor="device-url">
            URL
          </label>
          <input id="device-url" type="text" value={deviceUrl} onChange={(event) => setDeviceUrl(event.target.value)} className="mt-1 w-full rounded-md border border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)] px-2 py-1 text-sm" />
        </div>
        <div>
          <label className="block text-xs text-[var(--osio-fg-muted)]" htmlFor="device-model">
            Model
          </label>
          <input id="device-model" type="text" value={deviceModel} onChange={(event) => setDeviceModel(event.target.value)} className="mt-1 w-full rounded-md border border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)] px-2 py-1 text-sm" />
        </div>
        <div>
          <label className="block text-xs text-[var(--osio-fg-muted)]" htmlFor="device-key">
            Key (optional)
          </label>
          <input id="device-key" type="password" autoComplete="off" value={deviceKey} onChange={(event) => setDeviceKey(event.target.value)} className="mt-1 w-full rounded-md border border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)] px-2 py-1 text-sm" />
        </div>
        {deviceError ? (
          <p role="alert" className="text-sm text-[var(--osio-danger)]">
            {deviceError}
          </p>
        ) : null}
        {deviceTestResult ? <p className="text-sm text-[var(--osio-fg-muted)]">{deviceTestResult}</p> : null}
        <p className="text-sm text-[var(--osio-fg-muted)]">
          This device: no approvals, no write tools, no MCP, no usage metering. Only your workspace sources come from osionos.
        </p>
        <div className="space-y-1 text-xs text-[var(--osio-fg-muted)]">
          <p>{`OLLAMA_ORIGINS=${origin}`}</p>
          <p>{`llama-server --cors-origins ${origin} --api-key …`}</p>
          <p>{`opencode serve --cors ${origin} (with OPENCODE_SERVER_PASSWORD)`}</p>
          <p>LM Studio: Enable CORS</p>
        </div>
      </div>
    </ChoiceCard>
  );
};
