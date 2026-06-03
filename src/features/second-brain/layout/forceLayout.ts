/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   forceLayout.ts                                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/02 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/02 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  type Simulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from "d3-force";

/**
 * A DOM-free wrapper around d3-force that operates purely on node *indices* and
 * is driven by manual `tick()` calls — so it runs identically inside a Web
 * Worker (doc 04 §3) or, as a fallback, on the main thread. It never touches
 * React or the canvas; callers read positions into flat arrays.
 */

interface SimNode extends SimulationNodeDatum {
  index: number;
}
interface SimLink extends SimulationLinkDatum<SimNode> {
  strength: number;
}

export interface LayoutLink {
  source: number;
  target: number;
  strength: number;
}

export interface ForceLayoutInit {
  count: number;
  links: LayoutLink[];
  width: number;
  height: number;
  /** Optional seed positions (length `count`) to preserve layout across rebuilds. */
  seedX?: Float32Array | null;
  seedY?: Float32Array | null;
}

/** Alpha below which the layout is considered settled. */
export const ALPHA_SETTLED = 0.012;
const GOLDEN_ANGLE = 2.399963229728653;

/** Deterministic golden-spiral seed positions around the viewport center. */
export function seedPositions(count: number, width: number, height: number): { x: Float32Array; y: Float32Array } {
  const x = new Float32Array(count);
  const y = new Float32Array(count);
  const cx = width / 2;
  const cy = height / 2;
  for (let i = 0; i < count; i += 1) {
    const radius = 12 * Math.sqrt(i + 1);
    x[i] = cx + Math.cos(i * GOLDEN_ANGLE) * radius;
    y[i] = cy + Math.sin(i * GOLDEN_ANGLE) * radius;
  }
  return { x, y };
}

export class ForceLayout {
  private readonly sim: Simulation<SimNode, SimLink>;
  private readonly nodes: SimNode[];

  constructor(init: ForceLayoutInit) {
    const { count, width, height, seedX, seedY } = init;
    const cx = width / 2;
    const cy = height / 2;

    this.nodes = new Array<SimNode>(count);
    for (let i = 0; i < count; i += 1) {
      const radius = 12 * Math.sqrt(i + 1);
      this.nodes[i] = {
        index: i,
        x: seedX?.[i] ?? cx + Math.cos(i * GOLDEN_ANGLE) * radius,
        y: seedY?.[i] ?? cy + Math.sin(i * GOLDEN_ANGLE) * radius,
      };
    }

    const links: SimLink[] = init.links.map((link) => ({
      source: link.source,
      target: link.target,
      strength: link.strength,
    }));

    this.sim = forceSimulation<SimNode, SimLink>(this.nodes)
      .force(
        "link",
        forceLink<SimNode, SimLink>(links)
          .id((node) => node.index)
          .distance((link) => 60 / Math.max(0.4, link.strength))
          .strength((link) => Math.min(0.7, 0.15 * link.strength)),
      )
      .force("charge", forceManyBody<SimNode>().strength(-90).distanceMax(520))
      .force("center", forceCenter<SimNode>(cx, cy))
      .force("collide", forceCollide<SimNode>().radius(16).iterations(1))
      .alpha(1)
      .alphaDecay(0.045)
      .velocityDecay(0.42)
      .stop(); // ticks are driven manually by the worker/fallback loop
  }

  tick(): void {
    this.sim.tick();
  }

  alpha(): number {
    return this.sim.alpha();
  }

  /** Raise alpha to reheat the simulation (e.g. on drag or structural change). */
  reheat(alpha: number): void {
    this.sim.alpha(Math.max(this.sim.alpha(), alpha));
  }

  pin(index: number, x: number, y: number): void {
    const node = this.nodes[index];
    if (node) {
      node.fx = x;
      node.fy = y;
    }
  }

  unpin(index: number): void {
    const node = this.nodes[index];
    if (node) {
      node.fx = null;
      node.fy = null;
    }
  }

  /** Copy current positions into the provided flat arrays. */
  readPositions(x: Float32Array, y: Float32Array): void {
    for (let i = 0; i < this.nodes.length; i += 1) {
      x[i] = this.nodes[i].x ?? 0;
      y[i] = this.nodes[i].y ?? 0;
    }
  }

  get count(): number {
    return this.nodes.length;
  }
}
