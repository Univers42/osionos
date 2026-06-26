/**
 * A DOM-free wrapper around d3-force that operates purely on node *indices* and is
 * driven by manual `tick()` calls — so it runs identically inside a Web Worker or,
 * as a fallback, on the main thread. It never touches React or the canvas; callers
 * read positions into flat arrays. Forces are kept as references so the console can
 * reshape the layout live via `setParams`.
 */

import {
  type ForceCenter,
  type ForceCollide,
  type ForceLink,
  type ForceManyBody,
  type ForceX,
  type ForceY,
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type Simulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from "d3-force";
import { type LayoutParams, DEFAULT_LAYOUT_PARAMS } from "./params";

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
  params?: LayoutParams;
  /** Optional seed positions (length `count`) to preserve layout across rebuilds. */
  seedX?: Float32Array | null;
  seedY?: Float32Array | null;
  /** Per-node database/mount group id — drives per-database cluster forces. */
  nodeGroups?: Uint8Array | null;
}

/** Alpha below which the layout is considered settled. */
export const ALPHA_SETTLED = 0.012;
export const GOLDEN_ANGLE = 2.399963229728653;

/** Deterministic golden-spiral seed positions around the viewport center. */
export function seedPositions(count: number, width: number, height: number): {
  x: Float32Array;
  y: Float32Array;
} {
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

/** Number of distinct groups in a node-group array (ids are dense 0..G-1). */
export function groupCount(nodeGroups: Uint8Array | null | undefined): number {
  if (!nodeGroups || nodeGroups.length === 0) return 0;
  let max = 0;
  for (let i = 0; i < nodeGroups.length; i += 1) if (nodeGroups[i] > max) max = nodeGroups[i];
  return max + 1;
}

/** Deterministic per-database cluster centres on a ring around the viewport centre.
 *  Shared by the seeder and the hold force so both agree on where a cluster lives;
 *  the ring scales with node count so big graphs don't overlap. */
export function clusterCenters(
  count: number,
  groups: number,
  width: number,
  height: number,
): Array<{ x: number; y: number }> {
  const cx = width / 2;
  const cy = height / 2;
  if (groups <= 1) return [{ x: cx, y: cy }];
  // Each cluster settles to roughly `clusterR`; size the ring so adjacent
  // centres on it clear ~2 radii, otherwise the islands overlap into one blob.
  const clusterR = 14 * Math.sqrt(Math.max(1, count) / groups);
  const ring = Math.max(180, (clusterR * 1.3) / Math.sin(Math.PI / groups));
  const out: Array<{ x: number; y: number }> = new Array(groups);
  for (let g = 0; g < groups; g += 1) {
    const angle = -Math.PI / 2 + (g / groups) * Math.PI * 2;
    out[g] = { x: cx + Math.cos(angle) * ring, y: cy + Math.sin(angle) * ring };
  }
  return out;
}

export class ForceLayout {
  private readonly sim: Simulation<SimNode, SimLink>;
  private readonly nodes: SimNode[];
  private readonly link: ForceLink<SimNode, SimLink>;
  private readonly charge: ForceManyBody<SimNode>;
  private readonly center: ForceCenter<SimNode>;
  private readonly collide: ForceCollide<SimNode>;
  private readonly groupX: ForceX<SimNode> | null;
  private readonly groupY: ForceY<SimNode> | null;

  constructor(init: ForceLayoutInit) {
    const { count, width, height, seedX, seedY, nodeGroups } = init;
    const cx = width / 2;
    const cy = height / 2;
    const groups = groupCount(nodeGroups);
    const centers = groups > 1 ? clusterCenters(count, groups, width, height) : null;

    this.nodes = new Array<SimNode>(count);
    const seeds = seedPositions(count, width, height);
    for (let i = 0; i < count; i += 1) {
      this.nodes[i] = { index: i, x: seedX?.[i] ?? seeds.x[i], y: seedY?.[i] ?? seeds.y[i] };
    }
    const links: SimLink[] = init.links.map((edge) => ({ ...edge }));

    this.link = forceLink<SimNode, SimLink>(links).id((node) => node.index);
    this.charge = forceManyBody<SimNode>();
    this.center = forceCenter<SimNode>(cx, cy);
    this.collide = forceCollide<SimNode>();
    this.groupX =
      centers && nodeGroups ? forceX<SimNode>((node) => centers[nodeGroups[node.index]]?.x ?? cx) : null;
    this.groupY =
      centers && nodeGroups ? forceY<SimNode>((node) => centers[nodeGroups[node.index]]?.y ?? cy) : null;

    this.sim = forceSimulation<SimNode, SimLink>(this.nodes)
      .force("link", this.link)
      .force("charge", this.charge)
      .force("center", this.center)
      .force("collide", this.collide)
      .alpha(1)
      .alphaDecay(0.06)
      .stop();
    if (this.groupX) this.sim.force("clusterX", this.groupX);
    if (this.groupY) this.sim.force("clusterY", this.groupY);
    this.applyParams(init.params ?? DEFAULT_LAYOUT_PARAMS);
  }

  /** Reshape the live simulation from new params and reheat. */
  setParams(next: LayoutParams): void {
    this.applyParams(next);
    this.reheat(0.4);
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

  private applyParams(p: LayoutParams): void {
    this.link
      .distance((l) => p.linkDistance / Math.max(0.4, l.strength))
      .strength((l) => Math.min(0.7, p.linkStrengthScale * l.strength));
    this.charge.strength(p.chargeStrength).distanceMax(p.chargeDistanceMax);
    this.center.strength(p.centerStrength);
    this.collide.radius(p.collideRadius).iterations(1);
    this.sim.velocityDecay(p.velocityDecay);
    const cluster = p.clusterStrength ?? 0;
    this.groupX?.strength(cluster);
    this.groupY?.strength(cluster);
  }
}
