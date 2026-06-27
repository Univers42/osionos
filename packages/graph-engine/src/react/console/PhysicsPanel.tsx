/**
 * Physics panel: live force-simulation sliders (changes flow to the worker via the
 * controls→engine effect) plus freeze / reheat buttons that act on the engine
 * directly.
 */

import type { ReactElement } from "react";
import type { GraphEngine } from "../../core/engine";
import type { Controls } from "../../core/state/controls";
import { Slider } from "./widgets";

export interface PhysicsPanelProps {
  controls: Controls;
  update: (mutate: (draft: Controls) => void) => void;
  engine: GraphEngine | null;
}

export function PhysicsPanel({ controls, update, engine }: PhysicsPanelProps): ReactElement {
  const p = controls.physics;
  const set = (key: keyof Controls["physics"], value: number): void =>
    update((draft) => {
      draft.physics[key] = value;
    });

  return (
    <div className="osio-gc-panel">
      <Slider
        label="Repulsion"
        min={10}
        max={320}
        step={5}
        value={-p.chargeStrength}
        onChange={(v) => set("chargeStrength", -v)}
        format={(v) => String(v)}
      />
      <Slider label="Link distance" min={20} max={200} step={2} value={p.linkDistance} onChange={(v) => set("linkDistance", v)} />
      <Slider
        label="Link pull"
        min={0.02}
        max={0.5}
        step={0.01}
        value={p.linkStrengthScale}
        onChange={(v) => set("linkStrengthScale", v)}
        format={(v) => v.toFixed(2)}
      />
      <Slider label="Node spacing" min={4} max={40} step={1} value={p.collideRadius} onChange={(v) => set("collideRadius", v)} />
      <Slider
        label="Gravity"
        min={0}
        max={1}
        step={0.05}
        value={p.centerStrength}
        onChange={(v) => set("centerStrength", v)}
        format={(v) => v.toFixed(2)}
      />
      <Slider
        label="Damping"
        min={0.1}
        max={0.9}
        step={0.02}
        value={p.velocityDecay}
        onChange={(v) => set("velocityDecay", v)}
        format={(v) => v.toFixed(2)}
      />
      <div className="osio-gc-row">
        <button type="button" className="osio-gc-btn" onClick={() => engine?.freeze()}>
          Freeze
        </button>
        <button type="button" className="osio-gc-btn" onClick={() => engine?.reheat()}>
          Reheat
        </button>
      </div>
    </div>
  );
}
